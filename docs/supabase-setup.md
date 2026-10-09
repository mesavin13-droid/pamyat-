# Подключение ПАМЯТЬ к Supabase

## Текущий проект

Отдельный проект ПАМЯТЬ уже создан и настроен. Не подключайте ROAD LIVE, BOOKTOOM или другие приложения.

- Project ref: `hrxcfzzkjsopdgeczihw`
- Project URL: `https://hrxcfzzkjsopdgeczihw.supabase.co`
- Region: `eu-west-2`
- Схема, политики RLS, приватное хранилище фотографий и миграции безопасности уже применены.
- Две Edge Functions YooKassa развёрнуты. Платежи не готовы к production, пока не будут заданы секреты провайдера и URL сайта.
- Vercel production deployment: `READY`.
- Сайт: https://pamyat-nsk.vercel.app
- Vercel deployment details: https://vercel.com/dmitriy9/pamyat-nsk/Dbp7vEnvY4y2gK7aM5wVqCergD47

Публичные переменные клиента уже добавлены в Vercel для production, preview и development. Для локального `.env.local` используются те же значения:

```env
NEXT_PUBLIC_SUPABASE_URL=https://hrxcfzzkjsopdgeczihw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_Ubp8wgsHJEF8iW6EnLGeiw_GD3P6L3E
```

Publishable key предназначен для браузера и не заменяет секретный серверный ключ. Никогда не помещайте секретные ключи в `NEXT_PUBLIC_*`.

## Новый отдельный проект

Для повторного развёртывания создайте отдельный Supabase project для ПАМЯТЬ. Не используйте проект ROAD LIVE, BOOKTOOM или другой продукт.

1. В SQL Editor нового проекта выполните весь файл `supabase/schema.sql` из этого репозитория.
2. В Authentication → URL Configuration укажите **Site URL** `https://pamyat-nsk.vercel.app` и добавьте Redirect URLs `https://pamyat-nsk.vercel.app/**` и `http://localhost:3000/**`. Затем проверьте вход по email-ссылке.
3. В Project Settings → API скопируйте Project URL и publishable key.
4. Добавьте их в локальный `.env.local` и в секреты проекта Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Secret key Supabase и секреты YooKassa нельзя размещать в переменных `NEXT_PUBLIC_*` или коммитить в Git.

## Первый администратор

1. Откройте сайт и запросите ссылку для входа со своего email.
2. Откройте ссылку из письма, чтобы создать профиль.
3. В SQL Editor выполните запрос, заменив адрес на свой:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('YOUR_ADMIN_EMAIL');
```

Повторно войдите на сайт. В профиле должна быть роль администратора. Далее можно менять роли сотрудников прямо в интерфейсе.

## Оплата YooKassa

Откройте Supabase → Edge Functions → Secrets и добавьте только на сервере:

- `YOOKASSA_SHOP_ID` — ID магазина из кабинета YooKassa
- `YOOKASSA_SECRET_KEY` — секретный ключ магазина из кабинета YooKassa
- `SITE_URL=https://pamyat-nsk.vercel.app`

Не присылайте секреты в чат и не коммитьте их в Git. Функции уже развёрнуты; после изменения кода нужно развернуть их заново, но после добавления secrets повторный deploy не требуется.

```bash
supabase functions deploy create-yookassa-payment
supabase functions deploy yookassa-webhook
```

В кабинете YooKassa укажите webhook на endpoint:

`https://hrxcfzzkjsopdgeczihw.supabase.co/functions/v1/yookassa-webhook`

Настройте события создания/изменения платежа, доступные в вашем кабинете. До тестирования с реальными реквизитами статус оплаты в проекте не считать production-проверенным.

## Фото

Bucket `order-photos` создаётся закрытым при выполнении `schema.sql`. Не делайте его публичным. Политики ограничивают чтение фото клиентом заказа, назначенным исполнителем или администратором.

## Важные проверки перед запуском

- Убедиться, что первое админское назначение роли выполнено только для доверенного аккаунта.
- Настроить Site URL и magic-link Redirect URLs, как указано выше.
- Провести тестовый платёж и отмену в доступном тестовом/боевом режиме провайдера.
- Проверить загрузку Фото ДО/ПОСЛЕ под ролью исполнителя.
- Проверить, что завершение заказа невозможно без обеих фотографий.
- Проверить, что клиент не может создать заказ к чужому месту или изменить сумму.
