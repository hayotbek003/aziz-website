const TOKEN_KEY = "aziz_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* приватный режим */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method || (body ? "POST" : "GET"), headers, body, cache: "no-store" });
  } catch {
    throw new ApiError(0, "Нет соединения с сервером");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    const msg = typeof detail === "string" ? detail : res.status >= 500 ? "Ошибка сервера, попробуйте позже" : `Ошибка ${res.status}`;
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

/** Сжатие изображения на клиенте (до 1600px, WebP) и загрузка в медиа-хранилище. */
export async function uploadImage(file: File, shopId?: number, maxSize = 1600): Promise<string> {
  let blob: Blob = file;
  if (file.type !== "image/svg+xml" && file.type !== "image/gif") {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/webp", 0.86),
      );
    } catch {
      blob = file;
    }
  }
  if (blob.size > 3 * 1024 * 1024) throw new ApiError(413, "Файл слишком большой (макс. 3 МБ)");
  const form = new FormData();
  const ext = blob.type === "image/webp" ? "webp" : file.name.split(".").pop() || "img";
  form.append("file", blob, `upload.${ext}`);
  if (shopId) form.append("shop_id", String(shopId));
  const res = await api<{ id: string }>("/api/me/media", { form });
  return res.id;
}
