// Rewrites the icon resources of a compiled Windows exe so Explorer shows
// the real app icon instead of a 16px face stretched to desktop size.
//
// Why this exists (Bun 1.4.0, found 2026-08-30): `bun build --compile
// --windows-icon=x.ico` writes all 7 RT_ICON faces from the .ico, but it
// does NOT remove the RT_GROUP_ICON that Bun's own template exe already
// carries for the default Bun logo. That leftover group still says
// "256x256 lives in RT_ICON id 1" — and after Bun's write, id 1 is now the
// .ico's 16x16 face. Explorer asks for the large size, trusts that group,
// and scales 16px up to 48/256px: the "mosaic" desktop icon. Bun's own
// 7-face group is also written with wrong byte counts for the 128/256
// faces. Verified by parsing the PE resource tree of both a plain
// `--compile` exe (1 group, 1 face, PNG) and ours (2 groups, corrupted).
//
// Fix: don't patch PE bytes by hand. Use the OS's own resource updater
// (kernel32 BeginUpdateResource/UpdateResource/EndUpdateResource): delete
// the template's named group ("IDI_MYICON"), overwrite the numeric groups
// (including Bun's id 0, which the API can't delete but can replace) with
// one correct table, and write the faces straight from the .ico. Windows
// rebuilds the resource directory itself, so the result is exactly what a
// normal resource compiler would have produced. Verified 2026-08-30 by
// re-parsing the PE tree and extracting the 256px face via
// PrivateExtractIconsW (the same path Explorer takes).
//
// Runs on Windows only (the API is Windows-only, and so is the target).
// Usage: bun run scripts/fix-windows-icon.ts <exe> <ico>
import { dlopen, FFIType, ptr, read, JSCallback } from "bun:ffi";

const [exePath, icoPath] = process.argv.slice(2);
if (!exePath || !icoPath) {
  console.error("usage: bun run scripts/fix-windows-icon.ts <exe> <ico>");
  process.exit(2);
}
if (process.platform !== "win32") {
  console.error("fix-windows-icon: Windows only (UpdateResource is a Win32 API)");
  process.exit(2);
}

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const GROUP_ID = 1; // resource id of the single icon group we keep
// Bun writes its resources as en-US (0x0409); we must match the existing
// language or UpdateResource adds a second entry instead of replacing.
const LANG_EN_US = 0x0409;

const k32 = dlopen("kernel32.dll", {
  BeginUpdateResourceW: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.ptr },
  UpdateResourceW: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u16, FFIType.ptr, FFIType.u32],
    returns: FFIType.i32,
  },
  EndUpdateResourceW: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  GetLastError: { args: [], returns: FFIType.u32 },
  EnumResourceNamesW: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  LoadLibraryExW: { args: [FFIType.ptr, FFIType.ptr, FFIType.u32], returns: FFIType.ptr },
  FreeLibrary: { args: [FFIType.ptr], returns: FFIType.i32 },
});

function wstr(s: string): Uint8Array {
  // UTF-16LE + NUL terminator, as LPCWSTR expects.
  const buf = new Uint8Array((s.length + 1) * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    buf[i * 2] = c & 0xff;
    buf[i * 2 + 1] = c >> 8;
  }
  return buf;
}
// MAKEINTRESOURCE(n): an integer id is passed as a pointer whose value is
// the id itself (high word zero).
const intRes = (n: number): Pointer => n as unknown as Pointer;
type Pointer = ReturnType<typeof ptr>;

// ---- read the .ico ----------------------------------------------------
const ico = new Uint8Array(await Bun.file(icoPath).arrayBuffer());
const dv = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
if (dv.getUint16(0, true) !== 0 || dv.getUint16(2, true) !== 1) {
  console.error("fix-windows-icon: not an .ico file:", icoPath);
  process.exit(1);
}
const faceCount = dv.getUint16(4, true);
interface Face {
  w: number;
  h: number;
  colors: number;
  planes: number;
  bpp: number;
  data: Uint8Array;
}
const faces: Face[] = [];
for (let i = 0; i < faceCount; i++) {
  const e = 6 + i * 16;
  const size = dv.getUint32(e + 8, true);
  const off = dv.getUint32(e + 12, true);
  faces.push({
    w: ico[e]!,
    h: ico[e + 1]!,
    colors: ico[e + 2]!,
    planes: dv.getUint16(e + 4, true),
    bpp: dv.getUint16(e + 6, true),
    data: ico.subarray(off, off + size),
  });
}

// RT_GROUP_ICON payload: GRPICONDIR (6B) + GRPICONDIRENTRY (14B) x N. Same
// as the .ico directory except each entry ends with the RT_ICON id (u16)
// instead of a file offset (u32).
const group = new Uint8Array(6 + faces.length * 14);
const gv = new DataView(group.buffer);
gv.setUint16(0, 0, true);
gv.setUint16(2, 1, true);
gv.setUint16(4, faces.length, true);
faces.forEach((f, i) => {
  const e = 6 + i * 14;
  group[e] = f.w;
  group[e + 1] = f.h;
  group[e + 2] = f.colors;
  group[e + 3] = 0;
  gv.setUint16(e + 4, f.planes, true);
  gv.setUint16(e + 6, f.bpp, true);
  gv.setUint32(e + 8, f.data.byteLength, true);
  gv.setUint16(e + 12, i + 1, true); // RT_ICON ids 1..N
});

// ---- find every existing icon/group id so we can delete them ----------
// UpdateResource with a NULL data pointer deletes; we must name the exact
// ids that exist (there's no "delete all of this type"). Enumerate them
// off the exe loaded as a data file.
const LOAD_LIBRARY_AS_DATAFILE = 0x00000002;
const LOAD_LIBRARY_AS_IMAGE_RESOURCE = 0x00000020;
const exeW = wstr(exePath);
const hmod = k32.symbols.LoadLibraryExW(ptr(exeW), null, LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE);
if (!hmod) {
  console.error("fix-windows-icon: LoadLibraryExW failed, error", k32.symbols.GetLastError());
  process.exit(1);
}
type ResName = number | string;
function collectNames(type: number): ResName[] {
  const names: ResName[] = [];
  const cb = new JSCallback(
    (_h: Pointer, _t: Pointer, name: Pointer, _p: Pointer) => {
      // IS_INTRESOURCE: high word zero -> integer id; otherwise a pointer
      // to a NUL-terminated UTF-16 name. Bun's template carries its own
      // group under a NAMED id (e.g. "640"), which is why a numeric-only
      // scan missed it the first time.
      const v = Number(name);
      if (v < 0x10000) names.push(v);
      else names.push(readW(name as Pointer));
      return 1;
    },
    { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  );
  k32.symbols.EnumResourceNamesW(hmod, intRes(type), cb.ptr, null);
  cb.close();
  return names;
}
function readW(p: Pointer): string {
  const out: number[] = [];
  for (let i = 0; i < 256; i++) {
    const c = read.u16(p, i * 2);
    if (c === 0) break;
    out.push(c);
  }
  return String.fromCharCode(...out);
}
const oldIcons = collectNames(RT_ICON);
const oldGroups = collectNames(RT_GROUP_ICON);
k32.symbols.FreeLibrary(hmod);
console.log(`fix-windows-icon: existing RT_ICON ${JSON.stringify(oldIcons)}, RT_GROUP_ICON ${JSON.stringify(oldGroups)}`);

// ---- rewrite ------------------------------------------------------------
const h = k32.symbols.BeginUpdateResourceW(ptr(exeW), 0);
if (!h) {
  console.error("fix-windows-icon: BeginUpdateResourceW failed, error", k32.symbols.GetLastError());
  process.exit(1);
}
function update(type: number, id: ResName, data: Uint8Array | null): void {
  const nameArg = typeof id === "number" ? intRes(id) : ptr(wstr(id));
  const ok = k32.symbols.UpdateResourceW(h, intRes(type), nameArg, LANG_EN_US, data ? ptr(data) : null, data ? data.byteLength : 0);
  if (!ok) {
    console.error(`fix-windows-icon: UpdateResourceW(type=${type}, id=${id}) failed, error`, k32.symbols.GetLastError());
    k32.symbols.EndUpdateResourceW(h, 1); // discard
    process.exit(1);
  }
}
// Bun writes its own 7-face group under numeric id 0, which the Win32 API
// refuses to address at all (MAKEINTRESOURCE(0) -> ERROR_INVALID_PARAMETER),
// so it can't be deleted. It doesn't need to be: Explorer's default icon
// is the FIRST RT_GROUP_ICON in directory order (named entries sort before
// numeric ones). Delete every named group (Bun's template logo, e.g.
// "640", the one that was actually winning), overwrite numeric ids
// including 0 with the correct table, and drop stale extra faces.
for (const id of oldGroups) {
  if (typeof id === "string") update(RT_GROUP_ICON, id, null);
  else if (id !== 0) update(RT_GROUP_ICON, id, null);
}
for (const id of oldIcons) if (typeof id === "number" && id > faces.length) update(RT_ICON, id, null);
faces.forEach((f, i) => update(RT_ICON, i + 1, f.data));
if (oldGroups.includes(0)) update(RT_GROUP_ICON, 0, group);
update(RT_GROUP_ICON, GROUP_ID, group);
if (!k32.symbols.EndUpdateResourceW(h, 0)) {
  console.error("fix-windows-icon: EndUpdateResourceW failed, error", k32.symbols.GetLastError());
  process.exit(1);
}
console.log(`fix-windows-icon: wrote 1 RT_GROUP_ICON (id ${GROUP_ID}) + ${faces.length} RT_ICON faces (${faces.map((f) => `${f.w || 256}px`).join(", ")}) into ${exePath}`);
