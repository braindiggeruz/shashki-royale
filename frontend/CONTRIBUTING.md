# 🤝 Руководство по вкладу

Спасибо за интерес к проекту Шашки Рояль! Вот как ты можешь помочь.

## 📋 Процесс вклада

### 1. Fork репозиторий
```bash
git clone https://github.com/YOUR_USERNAME/shashki-royale.git
cd shashki-royale
```

### 2. Создай ветку
```bash
git checkout -b feature/amazing-feature
```

### 3. Внеси изменения
```bash
# Отредактируй файлы
# Запусти тесты
pnpm test

# Проверь линтер
pnpm lint
```

### 4. Коммитай
```bash
git add .
git commit -m "Add amazing feature"
```

### 5. Push и Pull Request
```bash
git push origin feature/amazing-feature
# Открой Pull Request на GitHub
```

---

## 🎯 Типы вкладов

### 🐛 Баги
- Найди баг
- Откройте Issue с описанием
- Создай PR с фиксом

### ✨ Новые фичи
- Обсуди идею в Discussions
- Создай Issue с описанием
- Реализуй и отправь PR

### 📚 Документация
- Улучши README
- Добавь примеры
- Исправь опечатки

### 🧪 Тесты
- Добавь unit тесты
- Улучши покрытие
- Тестируй на реальных устройствах

---

## 📝 Правила кода

### TypeScript
```typescript
// ✅ Хорошо
const calculateMove = (board: Board, from: Position, to: Position): Move => {
  // ...
};

// ❌ Плохо
const calc = (b, f, t) => {
  // ...
};
```

### React компоненты
```typescript
// ✅ Хорошо
interface PlayerCardProps {
  name: string;
  rating: number;
  avatar?: string;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ name, rating, avatar }) => {
  return <div>{name} - {rating}</div>;
};

// ❌ Плохо
const PlayerCard = (props) => {
  return <div>{props.name} - {props.rating}</div>;
};
```

### Стиль кода
- Используй TypeScript (не any)
- Форматируй с Prettier
- Проверяй с ESLint
- Добавляй JSDoc комментарии

---

## 🧪 Тестирование

```bash
# Запусти все тесты
pnpm test

# Запусти конкретный тест
pnpm test -- rules.test.ts

# Запусти с покрытием
pnpm test -- --coverage
```

---

## 📦 Сборка и деплой

```bash
# Сборка
pnpm build

# Проверь что всё работает
pnpm preview

# Для мобильного
npx cap sync android
```

---

## 🔄 Pull Request процесс

1. **Заголовок PR:** `[Feature/Fix/Docs] Краткое описание`
2. **Описание:** Подробно что изменилось и почему
3. **Чек-лист:**
   - [ ] Тесты проходят
   - [ ] Код отформатирован
   - [ ] Документация обновлена
   - [ ] Нет конфликтов с main

---

## 🚫 Что НЕ нужно коммитить

```
❌ node_modules/
❌ dist/
❌ .env
❌ *.apk
❌ *.keystore
❌ .idea/
```

---

## 💡 Идеи для вклада

- [ ] Улучшить UI/UX
- [ ] Добавить новые режимы игры
- [ ] Оптимизировать производительность
- [ ] Добавить локализацию
- [ ] Улучшить тесты
- [ ] Добавить документацию
- [ ] Исправить баги
- [ ] Добавить новые фичи

---

## 📞 Вопросы?

- 📧 Email: support@shashki-royal.dev
- 💬 Discussions: https://github.com/altynkanafina1-ship-it/shashki-royale/discussions
- 🐛 Issues: https://github.com/altynkanafina1-ship-it/shashki-royale/issues

---

**Спасибо за вклад! 🎉**
