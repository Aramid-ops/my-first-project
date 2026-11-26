// Ծանուցումներ (Android / iPhone)։ Կայքում (web) չեն աշխատում։
// Աշխատում են միայն իսկական հավելվածում (EAS build), երբ app.json-ում կա EAS projectId։
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerPush(userId: string) {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return; // դեռ EAS նախագիծ չկա
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Պատվերներ', importance: Notifications.AndroidImportance.HIGH });
    }
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() });
  } catch {
    // ծանուցումները պարտադիր չեն հավելվածի աշխատանքի համար
  }
}
