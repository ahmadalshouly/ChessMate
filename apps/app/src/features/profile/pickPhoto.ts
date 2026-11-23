import { AVATAR_PHOTO_SIZE } from '@chessmate/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'camera' | 'library';
export type PickedPhoto = { base64: string; uri: string } | { canceled: true } | { denied: true };

/**
 * Lets the player take or choose a picture, crops it to a centred square and
 * scales it to AVATAR_PHOTO_SIZE, as a JPEG ready to upload (about 50–150 KB).
 */
export async function pickAvatarPhoto(source: PhotoSource): Promise<PickedPhoto> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { denied: true };
    result = await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front });
  } else {
    // The system photo picker needs no library permission.
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { canceled: true };

  // The crop screen already made it square on phones; the web picker does not crop.
  const loaded = await ImageManipulator.manipulate(asset.uri).renderAsync();
  const side = Math.min(loaded.width, loaded.height);
  const ctx = ImageManipulator.manipulate(loaded);
  if (loaded.width !== loaded.height && side > 0) {
    ctx.crop({ originX: Math.floor((loaded.width - side) / 2), originY: Math.floor((loaded.height - side) / 2), width: side, height: side });
  }
  if (side > AVATAR_PHOTO_SIZE) ctx.resize({ width: AVATAR_PHOTO_SIZE, height: AVATAR_PHOTO_SIZE });
  const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
  // Web builds may hand back a data: URL instead of a separate base64 string.
  const base64 = out.base64 || (out.uri.startsWith('data:') ? out.uri.slice(out.uri.indexOf(',') + 1) : '');
  if (!base64) throw new Error('Could not read the picture');
  return { base64, uri: out.uri };
}
