//! A small ZIP container reader and writer, enough for DOCX packages.
//!
//! Entries the engine does not touch keep their raw compressed bytes, so a
//! save writes them back byte-identical (J rule 16).

use std::io::{Read, Write};

use crate::DocError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    /// 0 stored, 8 deflate.
    pub method: u16,
    pub crc: u32,
    pub size: u32,
    /// The bytes as they sit in the archive (compressed when method is 8).
    pub raw: Vec<u8>,
}

impl Entry {
    pub fn stored(name: &str, data: &[u8]) -> Self {
        Entry {
            name: name.to_string(),
            method: 0,
            crc: crc32fast::hash(data),
            size: data.len() as u32,
            raw: data.to_vec(),
        }
    }

    pub fn deflated(name: &str, data: &[u8]) -> Self {
        let mut enc =
            flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
        let _ = enc.write_all(data);
        let raw = enc.finish().unwrap_or_default();
        Entry {
            name: name.to_string(),
            method: 8,
            crc: crc32fast::hash(data),
            size: data.len() as u32,
            raw,
        }
    }

    pub fn data(&self) -> Result<Vec<u8>, DocError> {
        let out = match self.method {
            0 => self.raw.clone(),
            8 => {
                let mut out = Vec::with_capacity(self.size as usize);
                flate2::read::DeflateDecoder::new(&self.raw[..])
                    .read_to_end(&mut out)
                    .map_err(|e| DocError::Package(format!("{}: {e}", self.name)))?;
                out
            }
            m => {
                return Err(DocError::Package(format!(
                    "{}: compression method {m} is not supported",
                    self.name
                )))
            }
        };
        if crc32fast::hash(&out) != self.crc {
            return Err(DocError::Package(format!("{}: CRC mismatch", self.name)));
        }
        Ok(out)
    }
}

fn u16_at(b: &[u8], at: usize) -> Result<u16, DocError> {
    b.get(at..at + 2)
        .map(|s| u16::from_le_bytes([s[0], s[1]]))
        .ok_or_else(|| DocError::Package("truncated archive".into()))
}

fn u32_at(b: &[u8], at: usize) -> Result<u32, DocError> {
    b.get(at..at + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .ok_or_else(|| DocError::Package("truncated archive".into()))
}

/// Reads every entry through the central directory.
pub fn read(bytes: &[u8]) -> Result<Vec<Entry>, DocError> {
    let eocd = (0..bytes.len().saturating_sub(21))
        .rev()
        .find(|&i| bytes[i..].starts_with(&[0x50, 0x4b, 0x05, 0x06]))
        .ok_or_else(|| DocError::Package("not a ZIP package".into()))?;
    let count = u16_at(bytes, eocd + 10)? as usize;
    let mut at = u32_at(bytes, eocd + 16)? as usize;
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        if u32_at(bytes, at)? != 0x0201_4b50 {
            return Err(DocError::Package("bad central directory".into()));
        }
        let method = u16_at(bytes, at + 10)?;
        let crc = u32_at(bytes, at + 16)?;
        let csize = u32_at(bytes, at + 20)? as usize;
        let size = u32_at(bytes, at + 24)?;
        let nlen = u16_at(bytes, at + 28)? as usize;
        let xlen = u16_at(bytes, at + 30)? as usize;
        let clen = u16_at(bytes, at + 32)? as usize;
        let local = u32_at(bytes, at + 42)? as usize;
        let name = String::from_utf8_lossy(
            bytes
                .get(at + 46..at + 46 + nlen)
                .ok_or_else(|| DocError::Package("truncated name".into()))?,
        )
        .to_string();
        let lnlen = u16_at(bytes, local + 26)? as usize;
        let lxlen = u16_at(bytes, local + 28)? as usize;
        let start = local + 30 + lnlen + lxlen;
        let raw = bytes
            .get(start..start + csize)
            .ok_or_else(|| DocError::Package(format!("{name}: truncated data")))?
            .to_vec();
        out.push(Entry {
            name,
            method,
            crc,
            size,
            raw,
        });
        at += 46 + nlen + xlen + clen;
    }
    Ok(out)
}

/// Writes the entries in order. A fixed timestamp keeps output deterministic.
pub fn write(entries: &[Entry]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    let (time, date) = (0u16, 0x21u16);
    for e in entries {
        let offset = out.len() as u32;
        let name = e.name.as_bytes();
        out.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        out.extend_from_slice(&20u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&e.method.to_le_bytes());
        out.extend_from_slice(&time.to_le_bytes());
        out.extend_from_slice(&date.to_le_bytes());
        out.extend_from_slice(&e.crc.to_le_bytes());
        out.extend_from_slice(&(e.raw.len() as u32).to_le_bytes());
        out.extend_from_slice(&e.size.to_le_bytes());
        out.extend_from_slice(&(name.len() as u16).to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(name);
        out.extend_from_slice(&e.raw);

        central.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&e.method.to_le_bytes());
        central.extend_from_slice(&time.to_le_bytes());
        central.extend_from_slice(&date.to_le_bytes());
        central.extend_from_slice(&e.crc.to_le_bytes());
        central.extend_from_slice(&(e.raw.len() as u32).to_le_bytes());
        central.extend_from_slice(&e.size.to_le_bytes());
        central.extend_from_slice(&(name.len() as u16).to_le_bytes());
        central.extend_from_slice(&[0u8; 12]);
        central.extend_from_slice(&offset.to_le_bytes());
        central.extend_from_slice(name);
    }
    let cd_offset = out.len() as u32;
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&[0u8; 4]);
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    out.extend_from_slice(&(central.len() as u32).to_le_bytes());
    out.extend_from_slice(&cd_offset.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entries_round_trip_and_keep_raw_bytes() {
        let a = Entry::deflated(
            "word/document.xml",
            b"<w:document>hello hello hello</w:document>",
        );
        let b = Entry::stored("[Content_Types].xml", b"<Types/>");
        let bytes = write(&[a.clone(), b.clone()]);
        let back = read(&bytes).unwrap();
        assert_eq!(back, vec![a.clone(), b]);
        assert_eq!(
            back[0].data().unwrap(),
            b"<w:document>hello hello hello</w:document>"
        );
        assert_eq!(write(&back), bytes);
    }
}
