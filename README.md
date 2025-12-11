# GetCourse + Whop Integration

Middleware сервер для интеграции платформы GetCourse с платежной системой Whop.

## Описание

Этот сервер обеспечивает связь между GetCourse и Whop, позволяя:
- Создавать заказы в GetCourse
- Перенаправлять пользователей на оплату в Whop
- Автоматически обновлять статус заказа в GetCourse после успешной оплаты

## Архитектура

```
[GetCourse] → [Middleware Server] → [Whop]
     ↑              ↓                   ↓
     └──────────────┴───────────────────┘
```

## Установка

### 1. Клонирование и установка зависимостей

```bash
cd getcourse-whop-integration
npm install
```

### 2. Настройка переменных окружения

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Заполните переменные окружения:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# GetCourse Configuration
GETCOURSE_ACCOUNT_NAME=your_account_name
GETCOURSE_API_KEY=your_getcourse_api_key

# Whop Configuration
WHOP_API_KEY=your_whop_api_key
WHOP_COMPANY_ID=biz_XXXXX
WHOP_WEBHOOK_SECRET=your_whop_webhook_secret

# Redirect URLs
SUCCESS_REDIRECT_URL=https://your-getcourse-domain.ru/success
CANCEL_REDIRECT_URL=https://your-getcourse-domain.ru/cancel

# Security (optional)
GETCOURSE_CALLBACK_SECRET=your_callback_secret_token
```

### 3. Получение ключей API

#### GetCourse API Key
1. Войдите в ваш аккаунт GetCourse
2. Перейдите в раздел "Настройки" → "API"
3. Сгенерируйте секретный ключ API
4. Скопируйте ключ в переменную `GETCOURSE_API_KEY`

#### Whop API Key
1. Войдите в [Whop Developer Dashboard](https://whop.com/developers)
2. Перейдите в раздел "API Keys"
3. Создайте новый API ключ
4. Скопируйте ключ в переменную `WHOP_API_KEY`
5. Скопируйте ваш Company ID (формат: `biz_XXXXX`) в `WHOP_COMPANY_ID`

#### Whop Webhook Secret
1. В Whop Developer Dashboard перейдите в раздел "Webhooks"
2. Создайте новый webhook
3. URL webhook: `https://your-server.com/api/whop-webhook`
4. Выберите API version `v1`
5. Выберите событие `payment.succeeded`
6. Скопируйте webhook secret (в base64) в `WHOP_WEBHOOK_SECRET`

## Запуск

### Development режим
```bash
npm run dev
```

### Production режим
```bash
npm start
```

Сервер будет доступен по адресу: `http://localhost:3000`

## API Endpoints

### 1. Health Check
```
GET /api/health
```

Проверка работоспособности сервера.

**Ответ:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-12-11T08:00:00.000Z",
  "service": "getcourse-whop-integration"
}
```

### 2. Create Checkout
```
GET/POST /api/create-checkout
```

Создание checkout в Whop на основе заказа из GetCourse.

**Параметры:**
- `deal_number` (обязательно) - номер заказа в GetCourse
- `user_email` (обязательно) - email пользователя
- `deal_cost` (обязательно) - сумма заказа
- `user_name` (опционально) - имя пользователя
- `offer_id` (опционально) - ID предложения
- `offer_title` (опционально) - название предложения
- `callback_secret` (опционально) - секретный токен для безопасности

**Пример запроса:**
```
GET /api/create-checkout?deal_number=12345&user_email=user@example.com&deal_cost=1000
```

**Ответ:**
```json
{
  "success": true,
  "checkout_url": "https://whop.com/checkout/plan_xxx?checkout_config=config_xxx",
  "plan_id": "plan_xxx",
  "checkout_config_id": "config_xxx"
}
```

### 3. Whop Webhook
```
POST /api/whop-webhook
```

Прием webhook от Whop после успешной оплаты. Автоматически обновляет статус заказа в GetCourse.

**Webhook payload от Whop:**
```json
{
  "type": "payment.succeeded",
  "data": {
    "id": "payment_xxx",
    "amount": 100000,
    "status": "succeeded",
    "metadata": {
      "deal_number": "12345",
      "user_email": "user@example.com"
    }
  }
}
```

## Настройка GetCourse

### 1. Создание процесса для callback-вызова

1. Войдите в GetCourse
2. Перейдите в "Процессы" → "Создать процесс"
3. Выберите объект: "Заказы"
4. Добавьте триггер: "Создан новый заказ"
5. Добавьте операцию: "Вызвать URL"

### 2. Настройка операции "Вызвать URL"

**URL для вызова:**
```
https://your-server.com/api/create-checkout?deal_number={object.deal_number}&user_email={deal.user.email}&deal_cost={object.deal_cost}&user_name={deal.user.first_name}&offer_title={object.offer_title}&callback_secret=YOUR_SECRET
```

**Метод:** GET или POST

**Настройки:**
- Время на ожидание соединения: 10 секунд
- Время на соединение: 10 секунд

### 3. Обработка ответа

После получения ответа от middleware, GetCourse получит `checkout_url`. Вам нужно:

1. Сохранить `checkout_url` в дополнительное поле заказа
2. Создать страницу перенаправления, которая отправит пользователя на `checkout_url`

**Или** использовать прямое перенаправление через JavaScript на странице заказа.

## Настройка Whop

### 1. Создание Company Webhook

1. Войдите в [Whop Developer Dashboard](https://whop.com/developers)
2. Перейдите в раздел "Webhooks" (не внутри приложения)
3. Нажмите "Create Webhook"
4. Введите URL: `https://your-server.com/api/whop-webhook`
5. Выберите API version: `v1`
6. Выберите событие: `payment_succeeded`
7. Сохраните webhook secret

### 2. Тестирование webhook

Используйте инструменты для тестирования webhooks:
- [ngrok](https://ngrok.com/) для локального тестирования
- [webhook.site](https://webhook.site/) для просмотра payload

## Деплой

### Рекомендуемые платформы

1. **Heroku**
   ```bash
   heroku create your-app-name
   heroku config:set GETCOURSE_API_KEY=xxx WHOP_API_KEY=xxx ...
   git push heroku main
   ```

2. **Railway**
   - Подключите GitHub репозиторий
   - Добавьте переменные окружения
   - Автоматический деплой

3. **DigitalOcean App Platform**
   - Создайте новое приложение
   - Подключите репозиторий
   - Настройте переменные окружения

4. **VPS (Ubuntu)**
   ```bash
   # Установка Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Клонирование репозитория
   git clone your-repo-url
   cd getcourse-whop-integration
   npm install
   
   # Установка PM2
   sudo npm install -g pm2
   
   # Запуск приложения
   pm2 start server.js --name getcourse-whop
   pm2 startup
   pm2 save
   ```

### SSL/HTTPS

Для production обязательно используйте HTTPS:
- Используйте Nginx как reverse proxy
- Получите SSL сертификат через Let's Encrypt
- Или используйте платформу с встроенным SSL (Heroku, Railway)

## Безопасность

1. **Всегда используйте HTTPS** для production
2. **Храните секретные ключи в переменных окружения**, не в коде
3. **Используйте `GETCOURSE_CALLBACK_SECRET`** для проверки callback-вызовов
4. **Проверяйте webhook signatures** от Whop
5. **Ограничьте доступ к API** по IP (опционально)
6. **Логируйте все операции** для аудита

## Мониторинг и логирование

### Просмотр логов

```bash
# Development
npm run dev

# Production с PM2
pm2 logs getcourse-whop
```

### Рекомендуемые инструменты

- **Sentry** - отслеживание ошибок
- **LogRocket** - мониторинг производительности
- **Datadog** - комплексный мониторинг

## Troubleshooting

### Проблема: Webhook от Whop не приходит

**Решение:**
1. Проверьте URL webhook в Whop Dashboard
2. Убедитесь, что сервер доступен извне (не localhost)
3. Проверьте логи сервера на наличие ошибок
4. Используйте webhook.site для тестирования

### Проблема: GetCourse не обновляет заказ

**Решение:**
1. Проверьте правильность API ключа GetCourse
2. Проверьте формат данных в запросе
3. Убедитесь, что email пользователя существует в GetCourse
4. Проверьте логи middleware на наличие ошибок от GetCourse API

### Проблема: Checkout URL не создается

**Решение:**
1. Проверьте Whop API ключ и Company ID
2. Убедитесь, что сумма передается в правильном формате (в центах)
3. Проверьте логи на наличие ошибок от Whop API

## Поддержка

Для вопросов и поддержки:
- Email: support@example.com
- GitHub Issues: https://github.com/your-repo/issues

## Лицензия

MIT License
