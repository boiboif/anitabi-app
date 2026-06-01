import type { AxiosRequestConfig, Method } from 'axios';
import { toast } from 'sonner-native';
import service from './request';

interface CreateHandlerParams {
  /** 请求基准地址 */
  baseUrl: string;
  /** 请求头工厂，可按 URL 动态设置 */
  headers?: (url: string) => Record<string, string>;
  /**
   * HTTP 状态码正确时，判断业务是否成功。
   * 不传则所有 2xx 响应都视为成功。
   */
  adaptor?: (resData: any, config: AxiosRequestConfig) => { success: boolean; msg: string; code: number };
  /** adaptor 判定失败时的回调，默认 toast.error + throw */
  errorHandler?: (res: any, config: AxiosRequestConfig) => void;
}

export const createHandler = (params: CreateHandlerParams) => {
  const { baseUrl, headers, adaptor, errorHandler } = params;

  const request =
    <Res>(url: string, method: Method, config?: AxiosRequestConfig) =>
    async (data?: any, innerConfig?: AxiosRequestConfig): Promise<Res> => {
      const merged: AxiosRequestConfig = {
        baseURL: baseUrl,
        url,
        method,
        ...config,
        ...innerConfig,
        headers: {
          ...headers?.(url),
          ...(config?.headers as Record<string, string>),
          ...(innerConfig?.headers as Record<string, string>),
        },
      };

      if (method === 'GET') {
        merged.params = data;
      } else {
        merged.data = data;
      }

      const response = await service.request<any, Res>(merged);

      if (adaptor) {
        const { success, msg, code } = adaptor(response ?? {}, merged);
        if (!success) {
          if (errorHandler) {
            errorHandler(response, merged);
          } else {
            toast.error(msg);
          }
          throw new Error(`${code}: ${msg}`);
        }
      }

      return response;
    };

  return {
    get: <Res>(url: string, config?: AxiosRequestConfig) => request<Res>(url, 'GET', config),
    post: <Res>(url: string, config?: AxiosRequestConfig) => request<Res>(url, 'POST', config),
    put: <Res>(url: string, config?: AxiosRequestConfig) => request<Res>(url, 'PUT', config),
    delete: <Res>(url: string, config?: AxiosRequestConfig) => request<Res>(url, 'DELETE', config),
  };
};
