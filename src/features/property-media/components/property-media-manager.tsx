"use client";

import { useState } from "react";

type MediaItem = Readonly<{
  id: string;
  state: string;
  visibility: string;
  sortOrder: number;
  isCover: boolean;
  version: string;
  failureCode: string | null;
  failureRetryable: boolean | null;
}>;

type UploadState = Readonly<{
  name: string;
  progress: number;
  state: "uploading" | "done" | "failed";
}>;

export function PropertyMediaManager({
  propertyId,
  initialPropertyVersion,
  initialItems,
}: Readonly<{
  propertyId: string;
  initialPropertyVersion: string;
  initialItems: readonly MediaItem[];
}>) {
  const [items, setItems] = useState([...initialItems]);
  const [propertyVersion, setPropertyVersion] = useState(
    initialPropertyVersion,
  );
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch(`/api/admin/properties/${propertyId}/media`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Medya listesi yenilenemedi");
    const body = (await response.json()) as { items: MediaItem[] };
    setItems(body.items);
  }

  function uploadPut(
    url: string,
    headers: Record<string, string>,
    file: File,
    index: number,
  ) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      for (const [name, value] of Object.entries(headers))
        xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        setUploads((current) =>
          current.map((entry, itemIndex) =>
            itemIndex === index
              ? {
                  ...entry,
                  progress: Math.round((event.loaded / event.total) * 100),
                }
              : entry,
          ),
        );
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("Upload failed"));
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(file);
    });
  }

  async function uploadOne(file: File, index: number) {
    const idempotencyKey = crypto.randomUUID();
    try {
      const initialized = await fetch(
        `/api/admin/properties/${propertyId}/media/uploads`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            declaredMimeType: file.type,
            byteSize: file.size,
            idempotencyKey,
          }),
        },
      );
      if (!initialized.ok) throw new Error("Upload başlatılamadı");
      const grant = (await initialized.json()) as {
        sessionId: string;
        upload: {
          url: string;
          headers: Record<string, string>;
        };
      };
      await uploadPut(grant.upload.url, grant.upload.headers, file, index);
      const finalized = await fetch(
        `/api/admin/properties/${propertyId}/media/uploads/${grant.sessionId}/finalize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idempotencyKey }),
        },
      );
      if (!finalized.ok) throw new Error("Upload doğrulanamadı");
      setUploads((current) =>
        current.map((entry, itemIndex) =>
          itemIndex === index
            ? { ...entry, progress: 100, state: "done" }
            : entry,
        ),
      );
      await refresh();
    } catch {
      setUploads((current) =>
        current.map((entry, itemIndex) =>
          itemIndex === index ? { ...entry, state: "failed" } : entry,
        ),
      );
    }
  }

  function onFiles(files: FileList | null) {
    if (!files) return;
    const selected = [...files];
    setUploads(
      selected.map((file) => ({
        name: file.name,
        progress: 0,
        state: "uploading",
      })),
    );
    void Promise.allSettled(selected.map(uploadOne));
  }

  async function sendCommand(command: Record<string, unknown>) {
    setError(null);
    const response = await fetch(`/api/admin/properties/${propertyId}/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...command, idempotencyKey: crypto.randomUUID() }),
    });
    if (!response.ok) {
      if (response.status === 409) await refresh();
      setError(
        response.status === 409
          ? "Liste değişti; güncel hali yüklendi."
          : "İşlem tamamlanamadı.",
      );
      return;
    }
    const body = (await response.json()) as { propertyVersion?: string };
    if (body.propertyVersion) setPropertyVersion(body.propertyVersion);
    await refresh();
  }

  async function reorder(
    next: MediaItem[],
    coverId = next.find((item) => item.isCover)?.id,
  ) {
    const normalized = next.map((item, index) => ({
      ...item,
      sortOrder: index + 1,
      isCover: item.id === coverId,
    }));
    await sendCommand({
      command: "reorder",
      expectedPropertyVersion: propertyVersion,
      items: normalized.map(({ id, sortOrder, isCover }) => ({
        mediaId: id,
        sortOrder,
        isCover,
      })),
    });
  }

  return (
    <section
      className="space-y-4 rounded-lg border p-6"
      aria-labelledby="property-media-heading"
    >
      <div>
        <h2 id="property-media-heading" className="text-lg font-semibold">
          İlan görselleri
        </h2>
        <p className="text-muted-foreground text-sm">
          JPEG, PNG veya WebP; dosya başına en fazla 15 MiB.
        </p>
      </div>
      <label className="inline-flex cursor-pointer rounded-md border px-3 py-2 text-sm font-medium">
        Görsel seç
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => onFiles(event.currentTarget.files)}
        />
      </label>
      {uploads.length > 0 && (
        <ul className="space-y-2" aria-label="Upload ilerlemesi">
          {uploads.map((upload, index) => (
            <li key={`${upload.name}-${index}`} className="text-sm">
              <span>{upload.name}</span> —{" "}
              <span>
                {upload.state === "failed"
                  ? "Başarısız"
                  : `${upload.progress}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz görsel eklenmedi.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDraggedId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggedId || draggedId === item.id) return;
                const next = [...items];
                const from = next.findIndex(
                  (candidate) => candidate.id === draggedId,
                );
                const to = next.findIndex(
                  (candidate) => candidate.id === item.id,
                );
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved!);
                setDraggedId(null);
                void reorder(next);
              }}
              className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
            >
              <span className="cursor-move" aria-label="Sürükleyerek sırala">
                ↕
              </span>
              <span>#{item.sortOrder}</span>
              <strong>{item.state}</strong>
              <span>{item.visibility}</span>
              {item.isCover && <span>Kapak</span>}
              {!item.isCover && item.state !== "DELETED" && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => void reorder(items, item.id)}
                >
                  Kapak yap
                </button>
              )}
              {item.state === "FAILED" && item.failureRetryable && (
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    void sendCommand({
                      command: "retry",
                      mediaId: item.id,
                      expectedMediaVersion: item.version,
                    })
                  }
                >
                  Tekrar dene
                </button>
              )}
              {item.state !== "DELETED" ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    void sendCommand({
                      command: "delete",
                      mediaId: item.id,
                      expectedMediaVersion: item.version,
                      expectedPropertyVersion: propertyVersion,
                      reasonCode: "ADMIN_REQUEST",
                    })
                  }
                >
                  Sil
                </button>
              ) : (
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    void sendCommand({
                      command: "restore",
                      mediaId: item.id,
                      expectedMediaVersion: item.version,
                      expectedPropertyVersion: propertyVersion,
                    })
                  }
                >
                  Geri yükle
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
