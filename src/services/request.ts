import { Toast } from '@boiboif/react-native-toast';
import i18n from '@/i18n';
import { translateMessage, type TranslationMessage } from '@/i18n/messages';
import type { AxiosError } from 'axios';
import axios from 'axios';

const codeMessage: Record<string, TranslationMessage> = {
  200: { key: 'theServerReturnedTheRequestedDataSuccessfully', defaultValue: '服务器成功返回请求的数据。' },
  201: { key: 'theDataWasCreatedOrUpdatedSuccessfully', defaultValue: '新建或修改数据成功。' },
  202: { key: 'theRequestWasQueuedForBackgroundProcessing', defaultValue: '一个请求已经进入后台排队（异步任务）。' },
  204: { key: 'theDataWasDeletedSuccessfully', defaultValue: '删除数据成功。' },
  400: {
    key: 'theRequestWasInvalidSoTheServerDidNotCreateOrUpdateAnyData',
    defaultValue: '发出的请求有错误，服务器没有进行新建或修改数据的操作。',
  },
  401: { key: 'youAreNotAuthorizedCheckYourCredentials', defaultValue: '用户没有权限（令牌、用户名、密码错误）。' },
  403: { key: 'accessToThisResourceIsForbidden', defaultValue: '用户得到授权，但是访问是被禁止的。' },
  404: {
    key: 'theRequestedRecordDoesNotExistSoTheServerDidNotPerformTheOperation',
    defaultValue: '发出的请求针对的是不存在的记录，服务器没有进行操作。',
  },
  405: { key: 'thisRequestMethodIsNotAllowed', defaultValue: '请求方法不被允许。' },
  406: { key: 'theRequestedResponseFormatIsUnavailable', defaultValue: '请求的格式不可得。' },
  410: { key: 'theRequestedResourceHasBeenPermanentlyRemoved', defaultValue: '请求的资源被永久删除，且不会再得到的。' },
  422: { key: 'aValidationErrorOccurredWhileCreatingTheObject', defaultValue: '当创建一个对象时，发生一个验证错误。' },
  500: { key: 'aServerErrorOccurred', defaultValue: '服务器发生错误，请检查服务器。' },
  502: { key: 'gatewayError', defaultValue: '网关错误。' },
  503: {
    key: 'theServiceIsTemporarilyUnavailableDueToOverloadOrMaintenance',
    defaultValue: '服务不可用，服务器暂时过载或维护。',
  },
  504: { key: 'gatewayTimeout', defaultValue: '网关超时。' },
};

const networkErrorMessage: TranslationMessage = { key: 'networkError', defaultValue: '网络异常' };

const service = axios.create({
  withCredentials: false,
  timeout: 1000 * 60,
});
// request interceptor
service.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);
// response interceptor
service.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error: AxiosError) => {
    if (error.code === 'ERR_NETWORK') {
      Toast.error(i18n.t('networkError', { defaultValue: '网络异常' }));
      return Promise.reject(error);
    }

    const { response } = error;
    if (response) {
      const message = codeMessage[response.status] ?? networkErrorMessage;
      Toast.error(translateMessage(i18n.t, message));
    }
    return Promise.reject(error);
  },
);
export default service;
