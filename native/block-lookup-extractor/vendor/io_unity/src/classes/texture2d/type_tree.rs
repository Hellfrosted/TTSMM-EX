use super::{Texture2D, Texture2DObject, TextureFormat};
use crate::classes::SerializedFileRef;

use crate::type_tree::convert::TryCastFrom;
use crate::unity_asset_view::UnityAssetViewer;
use num_enum::TryFromPrimitive;
use std::io::{prelude::*, SeekFrom};

fn checked_texture_resource_size(size: u64) -> anyhow::Result<usize> {
    if size > 256 * 1024 * 1024 {
        return Err(anyhow!("texture resource exceeds size limit"));
    }
    Ok(usize::try_from(size)?)
}

#[cfg(test)]
mod tests {
    use super::checked_texture_resource_size;

    #[test]
    fn rejects_oversized_texture_resource_before_allocation() {
        assert!(checked_texture_resource_size(256 * 1024 * 1024 + 1).is_err());
        assert_eq!(checked_texture_resource_size(16).unwrap(), 16);
    }
}

impl Texture2DObject for Texture2D<'_> {
    fn get_width(&self) -> anyhow::Result<u64> {
        Ok(u64::try_from(self.get_width()?)?)
    }
    fn get_height(&self) -> anyhow::Result<u64> {
        Ok(u64::try_from(self.get_height()?)?)
    }

    fn get_texture_format(&self) -> anyhow::Result<TextureFormat> {
        Ok(TextureFormat::try_from_primitive(
            self.get_texture_format()? as u32,
        )?)
    }

    fn get_image_data(&self, viewer: &UnityAssetViewer) -> anyhow::Result<Vec<u8>> {
        if let Ok(data) = self.get_image_data() {
            if !data.is_empty() {
                return Ok(data);
            }
        }

        if let Some(mut file) = viewer.get_resource_file_by_serialized_file_id_and_path(
            self.get_serialized_file_id(),
            &self.get_stream_data_path()?,
        ) {
            file.seek(SeekFrom::Start(self.get_stream_data_offset()?))?;
            let size = checked_texture_resource_size(self.get_stream_data_size()?)?;
            let mut data = vec![0u8; size];
            file.read_exact(&mut data)?;
            return Ok(data);
        }
        Err(anyhow!("cannot find image data"))
    }
}

impl Texture2D<'_> {
    fn get_width(&self) -> anyhow::Result<i64> {
        i64::try_cast_from(self.inner, "/Base/m_Width")
    }

    fn get_height(&self) -> anyhow::Result<i64> {
        i64::try_cast_from(self.inner, "/Base/m_Height")
    }

    fn get_texture_format(&self) -> anyhow::Result<i64> {
        i64::try_cast_from(self.inner, "/Base/m_TextureFormat")
    }

    fn get_image_data(&self) -> anyhow::Result<Vec<u8>> {
        <Vec<u8>>::try_cast_from(self.inner, "/Base/image data")
    }

    fn get_stream_data_path(&self) -> anyhow::Result<String> {
        String::try_cast_from(self.inner, "/Base/m_StreamData/path")
    }

    fn get_stream_data_offset(&self) -> anyhow::Result<u64> {
        u64::try_cast_from(self.inner, "/Base/m_StreamData/offset")
    }

    fn get_stream_data_size(&self) -> anyhow::Result<u64> {
        u64::try_cast_from(self.inner, "/Base/m_StreamData/size")
    }
}
