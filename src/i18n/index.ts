import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US'
import zhCN from './locales/zh-CN'
import zhTW from './locales/zh-TW'

export const SUPPORT_LOCALES = ['zh-TW', 'zh-CN', 'en-US'] as const

export type SupportLocale = (typeof SUPPORT_LOCALES)[number]

function resolveBrowserLocale(): SupportLocale {
  const browserLanguages = globalThis.navigator?.languages?.length
    ? globalThis.navigator.languages
    : [globalThis.navigator?.language]

  for (const language of browserLanguages) {
    const normalizedLanguage = language?.toLowerCase()

    if (['zh-tw', 'zh-hk', 'zh-mo'].includes(normalizedLanguage ?? '')) {
      return 'zh-TW'
    }

    if (normalizedLanguage === 'zh-cn') {
      return 'zh-CN'
    }
  }

  return 'en-US'
}

export const i18n = createI18n<[typeof zhTW], SupportLocale>({
  legacy: false,
  locale: resolveBrowserLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-TW': zhTW,
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})
