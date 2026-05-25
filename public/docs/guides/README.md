# Guide screenshots & videos

The end-user guides at **Docs → Guides** (`/docs/guides`) render screenshot/video
slots. Until an asset exists, each slot shows a dashed placeholder describing the
shot and the exact path to drop the file. Add the file and it appears
automatically — no code change needed.

## Naming convention

```
public/docs/guides/<guide-slug>/<step-number>.png      # screenshot
public/docs/guides/<guide-slug>/<step-number>.mp4      # video (steps marked as video)
```

- `<guide-slug>` and `<step-number>` are shown in the placeholder on each guide
  page (e.g. `public/docs/guides/create-po/4.mp4`).
- Steps are numbered from 1, top to bottom.

## Example

The "Create a purchase order" guide (`/docs/guides/create-po`), step 1 expects:

```
public/docs/guides/create-po/1.png
```

Guide slugs live in `src/app/(admin)/docs/guides/guides-data.ts`. To add or
reword a guide/step, edit that file.
