//! Windows named pipe server and the harness Job Object.

use std::fs::File;
use std::io;
use std::os::windows::ffi::OsStringExt;
use std::os::windows::io::{FromRawHandle, RawHandle};
use std::ptr::{null, null_mut};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use oa_kernel::Kernel;
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, BOOL, ERROR_PIPE_CONNECTED, FALSE, HANDLE, INVALID_HANDLE_VALUE,
};
use windows_sys::Win32::Storage::FileSystem::{FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_DUPLEX};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, IsProcessInJob, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, GetNamedPipeClientProcessId, PIPE_READMODE_BYTE,
    PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_SET_QUOTA, PROCESS_TERMINATE,
};

use crate::handle_connection;

/// The Job Object the harness runs in. Children inherit it and, because the
/// job does not allow breakaway, cannot leave it. Processes in it die when the
/// job closes (kill-on-close, B-AC-18).
pub struct HarnessJob {
    handle: HANDLE,
}

// SAFETY: a job object handle may be used from any thread.
unsafe impl Send for HarnessJob {}
// SAFETY: the methods only pass the handle to thread-safe kernel calls.
unsafe impl Sync for HarnessJob {}

impl HarnessJob {
    pub fn new() -> io::Result<Self> {
        // SAFETY: null attributes and name create an unnamed job with default security.
        let handle = unsafe { CreateJobObjectW(null(), null()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if ok == 0 {
            let err = io::Error::last_os_error();
            unsafe { CloseHandle(handle) };
            return Err(err);
        }
        Ok(HarnessJob { handle })
    }

    /// Places a running process in the job. The supervisor (D15) calls this
    /// for the harness it starts.
    pub fn assign(&self, pid: u32) -> io::Result<()> {
        // SAFETY: OpenProcess returns null on failure, which is checked.
        let process = unsafe { OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, FALSE, pid) };
        if process.is_null() {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: both handles are valid; the process handle is closed after use.
        let ok = unsafe { AssignProcessToJobObject(self.handle, process) };
        let err = io::Error::last_os_error();
        // SAFETY: `process` is a valid handle we own.
        unsafe { CloseHandle(process) };
        if ok == 0 {
            return Err(err);
        }
        Ok(())
    }

    /// Places this process in the job, so every process it starts is in it too.
    pub fn assign_current_process(&self) -> io::Result<()> {
        // SAFETY: the pseudo handle from GetCurrentProcess needs no closing.
        if unsafe { AssignProcessToJobObject(self.handle, GetCurrentProcess()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    /// Whether a process is in the job. Fails safe: a process that cannot be
    /// inspected counts as in the job, so its `human` commands are refused.
    pub fn contains(&self, pid: u32) -> bool {
        // SAFETY: OpenProcess returns null on failure, which is checked.
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid) };
        if process.is_null() {
            return true;
        }
        let mut result: BOOL = 0;
        // SAFETY: both handles are valid and `result` outlives the call.
        let ok = unsafe { IsProcessInJob(process, self.handle, &mut result) };
        // SAFETY: `process` is a valid handle we own.
        unsafe { CloseHandle(process) };
        ok == 0 || result != 0
    }
}

impl Drop for HarnessJob {
    fn drop(&mut self) {
        // SAFETY: we own the handle and close it once.
        unsafe { CloseHandle(self.handle) };
    }
}

/// Inspects the process image of a pipe client to check if it is the installed
/// oa-shell executable beside the kernel's own executable (spec B rule 3, PH-01).
pub fn is_beside_oa_shell(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid) };
    if process.is_null() {
        return false;
    }
    let mut buf = [0u16; 1024];
    let mut size = buf.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(process, 0, buf.as_mut_ptr(), &mut size) };
    unsafe { CloseHandle(process) };
    if ok == 0 || size == 0 {
        return false;
    }
    let client_exe = std::ffi::OsString::from_wide(&buf[..size as usize]);
    let client_path = std::path::PathBuf::from(client_exe);

    let is_shell_name = client_path
        .file_name()
        .and_then(|f| f.to_str())
        .is_some_and(|name| {
            name.eq_ignore_ascii_case("oa-shell.exe") || name.eq_ignore_ascii_case("oa-shell")
        });

    if !is_shell_name {
        return false;
    }

    if let Ok(cur) = std::env::current_exe() {
        if let (Some(cur_dir), Some(client_dir)) = (cur.parent(), client_path.parent()) {
            // Windows paths are case-insensitive.
            return cur_dir
                .as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(&client_dir.as_os_str().to_string_lossy());
        }
    }
    false
}

/// A named pipe that accepts one client per instance. Local clients only.
pub struct PipeListener {
    name: Vec<u16>,
    first: bool,
}

impl PipeListener {
    pub fn bind(name: &str) -> Self {
        PipeListener {
            name: name.encode_utf16().chain(std::iter::once(0)).collect(),
            first: true,
        }
    }

    /// Waits for the next client. Returns the connection and the client's
    /// process id (0 when the system cannot say). The first instance is
    /// created with FILE_FLAG_FIRST_PIPE_INSTANCE, so a process that already
    /// owns the name cannot be impersonated.
    pub fn accept(&mut self) -> io::Result<(File, u32)> {
        let pipe = self.create()?;
        Self::connect(pipe)
    }

    /// Creates the next pipe instance. The first call fails with
    /// ERROR_ACCESS_DENIED when another kernel already owns the name (PH-02).
    fn create(&mut self) -> io::Result<HANDLE> {
        let mut open_mode = PIPE_ACCESS_DUPLEX;
        if self.first {
            open_mode |= FILE_FLAG_FIRST_PIPE_INSTANCE;
        }
        // SAFETY: `name` is a NUL-terminated UTF-16 string that outlives the call.
        let pipe = unsafe {
            CreateNamedPipeW(
                self.name.as_ptr(),
                open_mode,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                PIPE_UNLIMITED_INSTANCES,
                64 * 1024,
                64 * 1024,
                0,
                null(),
            )
        };
        if pipe == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        self.first = false;
        Ok(pipe)
    }

    /// Waits for a client on a created instance and hands it over as a File.
    fn connect(pipe: HANDLE) -> io::Result<(File, u32)> {
        // SAFETY: `pipe` is a valid pipe handle; no overlapped I/O is used.
        let connected = unsafe { ConnectNamedPipe(pipe, null_mut()) };
        // SAFETY: GetLastError has no preconditions.
        if connected == 0 && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
            let err = io::Error::last_os_error();
            // SAFETY: we own the handle.
            unsafe { CloseHandle(pipe) };
            return Err(err);
        }
        let mut pid: u32 = 0;
        // SAFETY: `pipe` is a connected server handle and `pid` outlives the call.
        if unsafe { GetNamedPipeClientProcessId(pipe, &mut pid) } == 0 {
            pid = 0;
        }
        // SAFETY: we own `pipe` and hand that ownership to the File.
        let file = unsafe { File::from_raw_handle(pipe as RawHandle) };
        Ok((file, pid))
    }
}

/// Serves connections until accepting fails. Each connection runs on its own
/// thread. With no harness job, no connection is treated as the harness.
pub fn serve(
    kernel: Arc<Kernel>,
    job: Option<Arc<HarnessJob>>,
    mut listener: PipeListener,
) -> io::Result<()> {
    let mut owned = false;
    loop {
        let pipe = listener.create()?;
        if !owned {
            // This process now owns the pipe name, so it is the one serving
            // kernel: jobs checkpointed by the last shutdown resume (C-AC-25).
            owned = true;
            if let Err(e) = kernel.resume_checkpointed_jobs() {
                // SAFETY: we own the handle and nothing else uses it.
                unsafe { CloseHandle(pipe) };
                return Err(io::Error::other(e.message));
            }
        }
        let (conn, pid) = PipeListener::connect(pipe)?;
        let kernel = kernel.clone();
        let job = job.clone();
        thread::spawn(move || {
            let in_job = job.as_ref().is_some_and(|j| j.contains(pid));
            let beside_shell = is_beside_oa_shell(pid);
            if let Ok(crate::ConnectionOutcome::Shutdown) =
                handle_connection(&kernel, conn, in_job, beside_shell)
            {
                thread::sleep(Duration::from_millis(50));
                std::process::exit(0);
            }
        });
    }
}
