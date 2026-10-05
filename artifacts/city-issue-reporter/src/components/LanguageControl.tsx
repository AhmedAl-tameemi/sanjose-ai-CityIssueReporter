import { ChevronDown, Globe } from 'lucide-react';
import { languages, useLanguage, type LanguageCode } from '../i18n';

export default function LanguageControl() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <label className="language-selector">
      <Globe size={16} aria-hidden="true" />
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as LanguageCode)}
        aria-label={t('languageLabel')}
        data-testid="select-language"
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code}>{item.label}</option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  );
}