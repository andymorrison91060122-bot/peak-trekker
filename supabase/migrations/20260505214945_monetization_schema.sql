-- 商业化 schema 预留
-- 模型：基础模板永久免费，高级模板限时免费→付费

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (subscription_tier IN ('free', 'premium', 'premium_trial'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_template_unlocked_until TIMESTAMPTZ DEFAULT NULL;

-- Security note:
-- profiles currently uses column-level UPDATE grants so authenticated users
-- cannot self-promote admin/payment-related fields. Future user-editable
-- profile columns must be granted explicitly; do not restore table-wide UPDATE.
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;
REVOKE UPDATE (
  subscription_tier,
  premium_template_unlocked_until
) ON public.profiles FROM anon, authenticated;
