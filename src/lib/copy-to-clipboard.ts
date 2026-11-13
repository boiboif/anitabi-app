import { Toast } from '@boiboif/react-native-toast';
import { Clipboard } from 'react-native';

export function copyToClipboard(text: string, successMessage: string) {
  try {
    // RN 0.88 provides this core module without an additional native dependency.
    // Its void return value cannot confirm whether the native write succeeded.
    Clipboard.setString(text);
    Toast.show(successMessage);
  } catch {
    // Do not report success if invoking the clipboard fails synchronously.
  }
}
