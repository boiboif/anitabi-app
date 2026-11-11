import { Toast } from '@boiboif/react-native-toast';
import * as Clipboard from 'expo-clipboard';

export async function copyToClipboard(text: string, successMessage: string) {
  try {
    if (await Clipboard.setStringAsync(text)) Toast.show(successMessage);
  } catch {
    // Do not report success when the clipboard is unavailable.
  }
}
