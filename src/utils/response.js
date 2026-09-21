// Success envelope. Lists add `meta` for pagination; errors are shaped by the error handler.
export const ok = (res, data, meta) => res.status(200).json(meta ? { data, meta } : { data });
export const created = (res, data) => res.status(201).json({ data });
export const noContent = (res) => res.status(204).end();
