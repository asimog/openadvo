//! Windows named pipe server and the harness Job Object.

use std::fs::File;
use std::io;
use std::os::windows::io::{FromRawHandle, RawHandle};
use std::ptr::{null, null_mut};
use std::sync::Arc;
use std::thread;

use oa_kernel::Kernel;
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, BOOL, ERROR_PIPE_CONNECTED, FALSE, HANDLE, INVALID_HANDLE_VALUE,
};
use windows_sys::Win32::Storage::FileSystem::{FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_DUPLEX};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, IsProcessInJob,
};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, GetNamedPipeClientProcessId, PIPE_READMODE_BYTE,
    PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA,
    PROCESS_TERMINATE,
};

use crate::handle_connection;

/// The Job Object the harness runs in. Children inherit it and, because the
/// job does not allow breakaway, cannot leave it.
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
    loop {
        let (conn, pid) = listener.accept()?;
        let kernel = kernel.clone();
        let job = job.clone();
        thread::spawn(move || {
            let in_job = job.is_some_and(|j| j.contains(pid));
            let _ = handle_connection(&kernel, conn, in_job);
        });
    }
}
