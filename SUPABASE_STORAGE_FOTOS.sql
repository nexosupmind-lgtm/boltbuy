-- Execute no SQL Editor do projeto BOLT. Fotos são públicas para exibição no Shop;
-- upload é restrito a usuários autenticados e vinculados à empresa do caminho.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bolt-product-images','bolt-product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "bolt_product_images_insert" on storage.objects;
create policy "bolt_product_images_insert" on storage.objects for insert to authenticated
with check (bucket_id='bolt-product-images' and exists (
 select 1 from public.bolt_memberships m
 where m.user_id=auth.uid() and m.tenant_id::text=split_part(name,'/',1)
));
-- Nenhuma política de update/delete: uploads são imutáveis por padrão.
-- A leitura pública é permitida pela configuração public do bucket.
