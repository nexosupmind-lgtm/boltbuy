const bucket = "bolt-school-receipts";
export async function uploadReceipt(base, headers, clientId, studentId, file) {
  if (
    !file ||
    typeof file.arrayBuffer !== "function" ||
    file.size < 4 ||
    file.size > 2 * 1024 * 1024
  )
    throw Error("Use um comprovante de até 2 MB.");
  const data = new Uint8Array(await file.arrayBuffer());
  const png =
    data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71;
  const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  const pdf = new TextDecoder().decode(data.slice(0, 5)) === "%PDF-";
  const webp =
    new TextDecoder().decode(data.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(data.slice(8, 12)) === "WEBP";
  const type = png
    ? "image/png"
    : jpeg
      ? "image/jpeg"
      : webp
        ? "image/webp"
        : pdf
          ? "application/pdf"
          : null;
  if (!type) throw Error("Use uma imagem JPG, PNG, WebP ou um PDF válido.");
  const info = await fetch(base + "/storage/v1/bucket/" + bucket, { headers });
  if (info.status === 404) {
    const created = await fetch(base + "/storage/v1/bucket", {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: false,
        file_size_limit: 2 * 1024 * 1024,
        allowed_mime_types: [
          "image/png",
          "image/jpeg",
          "image/webp",
          "application/pdf",
        ],
      }),
    });
    if (!created.ok && created.status !== 409)
      throw Error("Não foi possível preparar o armazenamento privado.");
  } else if (!info.ok)
    throw Error("Armazenamento de comprovantes indisponível.");
  const config = info.ok ? await info.json() : { public: false };
  if (config.public === true)
    throw Error(
      "O armazenamento precisa estar privado para receber comprovantes.",
    );
  const path =
    clientId +
    "/" +
    crypto.randomUUID() +
    "." +
    {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "application/pdf": "pdf",
    }[type];
  const saved = await fetch(
    base + "/storage/v1/object/" + bucket + "/" + path,
    {
      method: "POST",
      headers: { ...headers, "content-type": type, "x-upsert": "false" },
      body: data,
    },
  );
  if (!saved.ok) throw Error("Não foi possível guardar o comprovante.");
  return { path, name: String(file.name || "Comprovante").slice(0, 160) };
}
export async function removeReceipt(base, headers, path) {
  await fetch(base + "/storage/v1/object/" + bucket, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ prefixes: [path] }),
  });
}
export async function receiptURL(base, headers, path) {
  const response = await fetch(
    base + "/storage/v1/object/sign/" + bucket + "/" + path,
    { method: "POST", headers, body: JSON.stringify({ expiresIn: 300 }) },
  );
  if (!response.ok) throw Error("Não foi possível abrir o comprovante.");
  const result = await response.json(),
    signed = result.signedURL || result.signedUrl;
  if (
    typeof signed !== "string" ||
    !signed.startsWith("/object/sign/" + bucket + "/")
  )
    throw Error("Endereço do comprovante inválido.");
  return base + "/storage/v1" + signed;
}
