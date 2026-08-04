import { registerWebModule, NativeModule } from 'expo';

import { ToasterModuleEvents } from './Toaster.types';

class ToasterModule extends NativeModule<ToasterModuleEvents> {
  isSupported = false;
  init() {}
  isInit() {
    return false;
  }
  show(_message: string) {}
  showWithOptions(_message: string, _options?: Record<string, any> | null) {}
  showShort(_message: string) {}
  showLong(_message: string) {}
  debugShow(_message: string) {}
  delayedShow(_message: string, _delayMillis: number) {}
  showSystem(_message: string) {}
  cancel() {}
  setDefaultStyle(_style: Record<string, unknown> | null) {}
  setGravity(_gravity: number) {}
  setGravityWithOffset(_gravity: number, _xOffset: number, _yOffset: number) {}
};

export default registerWebModule(ToasterModule, 'Toaster');
