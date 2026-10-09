# Подключение ПАМЯТЬ к Supabase

## Новый отдельный проект

Не используйте проект ROAD LIVE, BOOKTOOM или другой продукт. Создайте отдельный Supabase project для ПАМЯТЬ.

1. В SQL Editor нового проекта выполните весь файл `supabase/schema.sql` из этого репозитория.
2. В Authentication включите вход по email-ссылке и укажите URL сайта в Redirect URLs.
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

Добавьте secrets в Supabase Edge Functions, не в Git:

- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `SITE_URL` — полный URL production-сайта

Затем разверните функции:

```bash
supabase functions deploy create-yookassa-payment
supabase functions deploy yookassa-webhook
```

В кабинете YooKassa укажите webhook на endpoint:

`https://YOUR_PROJECT.supabase.co/functions/v1/yookassa-webhook`

Настройте события создания/изменения платежа, доступные в вашем кабинете. До тестирования с реальными реквизитами статус оплаты в проекте не считать production-проверенным.

## Фото

Bucket `order-photos` создаётся закрытым при выполнении `schema.sql`. Не делайте его публичным. Политики ограничивают чтение фото клиентом заказа, назначенным исполнителем или администратором.

## Важные проверки перед запуском

- Убедиться, что первое админское назначение роли выполнено только для доверенного аккаунта.
- Проверить magic-link redirect URLs.
- Провести тестовый платёж и отмену в доступном тестовом/боевом режиме провайдера.
- Проверить загрузку Фото ДО/ПОСЛЕ под ролью исполнителя.
- Проверить, что завершение заказа невозможно без обеих фотографий.
- Проверить, что клиент не может создать заказ к чужому месту или изменить сумму.
