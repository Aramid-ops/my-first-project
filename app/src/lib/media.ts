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
