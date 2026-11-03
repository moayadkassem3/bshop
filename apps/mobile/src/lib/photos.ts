import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Photos from the phone (as the website's lib/image.ts): picked from the gallery
 * or taken with the camera, then made smaller (longest side 1600 px, JPEG) so
 * uploads are quick on mobile data.
 */
export async function pickPhotos(options: { camera?: boolean; multiple?: boolean; limit?: number } = {}): Promise<string[]> {
  const settings: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: Boolean(options.multiple),
    selectionLimit: options.limit ?? 0,
  };
  if (options.camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return [];
  }
  const result = options.camera ? await ImagePicker.launchCameraAsync(settings) : await ImagePicker.launchImageLibraryAsync(settings);
  if (result.canceled) return [];
  const out: string[] = [];
  for (const asset of result.assets) out.push(await shrink(asset.uri, asset.width, asset.height));
  return out;
}

async function shrink(uri: string, width: number, height: number): Promise<string> {
  const longest = Math.max(width, height);
  const context = ImageManipulator.manipulate(uri);
  if (longest > 1600) context.resize(width >= height ? { width: 1600 } : { height: 1600 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return saved.uri;
}
