// Նկարներ. ընտրել հեռախոսից → բեռնել Supabase Storage (media) → հանրային հղում
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

/** `folder`՝ «firm/<firmId>» կամ «shop/<shopId>» (թույլտվությունները՝ բազայում) */
export async function pickAndUpload(folder: string): Promise<{ url?: string; error?: string }> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true });
  if (res.canceled || !res.assets?.[0]) return {};
  const a = res.assets[0];
  const ext = (a.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await (await fetch(a.uri)).arrayBuffer();
  const { error } = await supabase.storage.from('media').upload(path, body, { contentType: a.mimeType ?? 'image/jpeg' });
  if (error) return { error: error.message };
  return { url: supabase.storage.from('media').getPublicUrl(path).data.publicUrl };
}

/**
 * Փակ փաստաթղթեր (նույնականացում). պահվում են «kyc» փակ պահոցում՝ <user_id>/... պանակում։
 * Վերադարձնում է պահոցի ուղին (հանրային հղում ՉԿԱ)։
 */
export async function pickPrivateDoc(userId: string, name: string, source: 'camera' | 'library'): Promise<{ path?: string; previewUri?: string; error?: string }> {
  if (source === 'camera') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return { error: 'Թույլ տվեք տեսախցիկի օգտագործումը' };
  }
  const opts = { mediaTypes: ['images'] as ImagePicker.MediaType[], quality: 0.7 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return {};
  const a = res.assets[0];
  const path = `${userId}/${name}-${Date.now()}.jpg`;
  const body = await (await fetch(a.uri)).arrayBuffer();
  const { error } = await supabase.storage.from('kyc').upload(path, body, { contentType: a.mimeType ?? 'image/jpeg' });
  return error ? { error: error.message } : { path, previewUri: a.uri };
}
