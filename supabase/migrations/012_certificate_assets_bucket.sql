-- Public storage bucket for certificate background/signature images,
-- uploaded from /admin/certificates. Every upload goes through
-- src/actions/certificates.ts's uploadCertificateAsset() using the
-- service-role client, which bypasses Storage RLS entirely — so this
-- bucket needs no storage.objects policies, only public:true so the
-- printed certificates' plain <img src> URLs load without auth.
-- Idempotent: safe to re-run.

insert into storage.buckets (id, name, public)
values ('certificate-assets', 'certificate-assets', true)
on conflict (id) do nothing;
