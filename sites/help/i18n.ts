import { defineI18n } from "fumadocs-core/i18n";
import { uiTranslations } from "fumadocs-ui/i18n";
import { fumapressTranslations } from "fumapress/i18n";
export const languages = ["en", "th", "ja"] as const;
export const i18n = defineI18n({ languages: [...languages], defaultLanguage: "en", fallbackLanguage: null });
export const translations = i18n.translations().extend(uiTranslations()).extend(fumapressTranslations()).add({
  en: { displayName: "English" },
  th: { displayName: "ไทย", "Search(search dialog)": "ค้นหาคู่มือ", "Search(search trigger)": "ค้นหา", "On this page(table of contents)": "ในหน้านี้", "Copy Markdown(page actions)": "คัดลอก Markdown", "Open(page actions)": "เปิด", "No results found(search dialog)": "ไม่พบผลลัพธ์" },
  ja: { displayName: "日本語", "Search(search dialog)": "ガイドを検索", "Search(search trigger)": "検索", "On this page(table of contents)": "このページの内容", "Copy Markdown(page actions)": "Markdownをコピー", "Open(page actions)": "開く", "No results found(search dialog)": "見つかりませんでした" },
});
