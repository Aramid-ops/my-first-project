import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Հանրային (publishable) բանալին նախատեսված է հավելվածի ներսում լինելու համար։
// Ով ինչ է տեսնում՝ որոշում են բազայի RLS կանոնները (supabase/migrations)։
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://wtramatlfdxbxakaoyyq.supabase.co';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_kcWRtnp3028fKymmlOdMwg_RQxm84A2';

export const supabase = createClient(url, key, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
