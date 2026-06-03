/**
 * 翻译提供者接口
 * 定义翻译服务的统一契约，当前唯一实现为 DirectAPIProvider
 */

import type { TranslationRequest, TranslationResult } from '@shared/types';

export interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
