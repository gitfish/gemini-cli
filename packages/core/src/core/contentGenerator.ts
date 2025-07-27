/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters
} from '@google/genai';
import { DEFAULT_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

export type ContentGeneratorConfig = {
  model: string;
  proxy?: string | undefined;
};

export function createContentGeneratorConfig(
  config: Config,
): ContentGeneratorConfig {

  // Use runtime model from config if available; otherwise, fall back to parameter or default
  const effectiveModel = config.getModel() || DEFAULT_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    proxy: config?.getProxy(),
  };

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig
): Promise<ContentGenerator> {

  async function* createGenerateContentStream(
    request: GenerateContentParameters,
  ) {
    console.log('-- Create Generate Content Stream', request);
    const res: GenerateContentResponse = {
      codeExecutionResult: 'streamed result',
      data: 'streamed data',
      executableCode: 'streamed executable code',
      functionCalls: [],
      text: 'streamed text'
    };
    yield res;
  }

  // TODO: our lm studio content generator
  return {
    countTokens: async (request) => {
      console.log('-- Count Tokens Request', request);
      return {
        cachedContentTokenCount: 0,
        totalTokens: 0
      };
    },
    embedContent: async (params) => {
      console.log('-- Embed Content', params);
      return {

      };
    },
    generateContent: async (params) => {
      console.log('-- Generate Content', params);
      return {
        codeExecutionResult: 'yep',
        data: 'data',
        executableCode: 'executable code',
        functionCalls: [],
        text: 'generated text'
      }
    },
    generateContentStream: async (request) => {
      console.log('-- Generate Content Stream', request);
      return createGenerateContentStream(request);
    }
  };
}
