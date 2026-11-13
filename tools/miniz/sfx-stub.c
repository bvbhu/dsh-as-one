/* as-one SFX stub — 64-bit, headless, self-locating.
 *
 * Build:   x86_64-w64-mingw32-gcc -O2 -o sfx-stub.exe sfx-stub.c miniz.c -lws2_32 -mwindows
 * Payload: concat(stub.exe, payload.zip)  ->  As-One.exe
 *
 * Behaviour:
 *   1. locate own exe path
 *   2. scan backwards for the ZIP End-Of-Central-Directory signature
 *   3. open the embedded zip with miniz (offset = eocd position)
 *   4. extract every entry to %LOCALAPPDATA%\As One\app  (override: AS_ONE_EXTRACT_DIR)
 *   5. spawn "<extract>\As One.exe"
 *
 * Exit codes: 0 ok, 1 no own path, 2 no eocd, 3 bad zip, 4 extract failed, 5 launch failed
 */
#define _CRT_SECURE_NO_WARNINGS
#define MINIZ_NO_TIME
#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "miniz.h"

#define EOCD_SIG 0x06054b50
#define EOCD64_LOCATOR_SIG 0x07064b50
#define EOCD64_SIG 0x06064b50

#define APP_SUBDIR "As One"
#define APP_EXE_REL "As One.exe"

/* Longest entry name we are willing to build a full path for. */
#define MAX_REL 1024

static void msg(const char *what, const char *detail) {
    /* headless: never block on a dialog. Write to stderr and, if we can, to a log file. */
    fprintf(stderr, "[as-one sfx] %s%s%s\n", what, detail ? ": " : "", detail ? detail : "");
    fflush(stderr);
}

/* Fatal error: the GUI-subsystem build has no console, so stderr goes nowhere.
 * Without this the double-click failure is completely silent. Always surface it. */
static void fatal(const char *what, const char *detail) {
    char text[2048];
    msg(what, detail);
    _snprintf(text, sizeof(text),
              "As One \xc2\xb7 \xe5\x90\x88\xe4\xb8\x80\n\n%s%s%s",
              what, detail ? ": " : "", detail ? detail : "");
    text[sizeof(text) - 1] = 0;
    MessageBoxA(NULL, text, "As One \xc2\xb7 \xe5\x90\x88\xe4\xb8\x80",
                MB_OK | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST);
}

/* Windows error code -> readable text, so the dialog says why. */
static void winerr(const char *what, const char *path, DWORD err) {
    char detail[1280];
    char sys[1024];
    DWORD n = FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                             NULL, err, 0, sys, sizeof(sys), NULL);
    if (n == 0) _snprintf(sys, sizeof(sys), "error %lu", err);
    _snprintf(detail, sizeof(detail), "%s (GetLastError=%lu %s)", path, err, sys);
    detail[sizeof(detail) - 1] = 0;
    fatal(what, detail);
}

/* Preflight: prove we can actually create the target directory before we spend
 * 1.5s extracting 120MB into it. Catches the "run from a read-only location"
 * class of failure up front.
 *
 * IMPORTANT: do NOT feed CreateDirectory() a bare drive root like "C:".
 * It returns ERROR_ACCESS_DENIED (5) even for an existing drive, which aborted
 * the whole extraction on the very first segment of any C:\... path. */
static int ensure_dirs_checked(const char *path) {
    char tmp[MAX_PATH];
    size_t n = strlen(path);
    if (n >= sizeof(tmp)) {
        fatal("extract path too long", path);
        return 0;
    }
    strcpy(tmp, path);
    for (size_t i = 0; i < n; i++) {
        /* i > 2 而不是 i > 0:索引 2 处的反斜杠后面紧跟盘符尾(C:),截断出来是
         * 裸盘符路径。CreateDirectory("C:") 恒返回 ERROR_ACCESS_DENIED(5) ——
         * 实测(见 .tmp-probe/mkdir-probe.c):D: 返回 183(已存在),C: 返回 5。
         * 这正是「cannot create extract directory: C: (GetLastError=5)」的根因:
         * 第一段就失败,整个提取被中止。 */
        if (tmp[i] == '\\' && i > 2) {
            tmp[i] = 0;
            if (!CreateDirectoryA(tmp, NULL) && GetLastError() != ERROR_ALREADY_EXISTS) {
                winerr("cannot create extract directory", tmp, GetLastError());
                return 0;
            }
            tmp[i] = '\\';
        }
    }
    if (!CreateDirectoryA(tmp, NULL) && GetLastError() != ERROR_ALREADY_EXISTS) {
        winerr("cannot create extract directory", tmp, GetLastError());
        return 0;
    }
    return 1;
}

/* ---------------------------------------------------------------- own path */

static int self_path(char *out, size_t cap) {
    DWORD n = GetModuleFileNameA(NULL, out, (DWORD)cap);
    if (n == 0 || n >= (DWORD)cap) return 0;
    return 1;
}

/* --------------------------------------------------------- eocd scanning */

/* Returns the file offset of the first byte of the EOCD record, or -1.
 * On success also reports the total file size. */
static long long find_eocd(const char *path, long long *fileSize) {
    HANDLE h = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return -1;

    LARGE_INTEGER size;
    if (!GetFileSizeEx(h, &size)) { CloseHandle(h); return -1; }
    if (fileSize) *fileSize = (long long)size.QuadPart;

    const DWORD kTail = 1024 * 1024; /* last 1 MiB is plenty for a comment-less eocd */
    DWORD toRead = (DWORD)((size.QuadPart < (long long)kTail) ? size.QuadPart : (long long)kTail);
    long long start = size.QuadPart - (long long)toRead;

    BYTE *buf = (BYTE *)malloc(toRead);
    if (!buf) { CloseHandle(h); return -1; }

    OVERLAPPED ov; memset(&ov, 0, sizeof(ov));
    ov.Offset = (DWORD)(start & 0xFFFFFFFFULL);
    ov.OffsetHigh = (DWORD)((start >> 32) & 0xFFFFFFFFULL);

    DWORD got = 0;
    BOOL ok = ReadFile(h, buf, toRead, &got, &ov);
    CloseHandle(h);
    if (!ok || got == 0) { free(buf); return -1; }

    long long found = -1;
    /* scan backwards so we land on the LAST eocd, which is the real one */
    for (long long i = (long long)got - 22; i >= 0; i--) {
        if (buf[i] == 0x50 && buf[i + 1] == 0x4b && buf[i + 2] == 0x05 && buf[i + 3] == 0x06) {
            found = start + i;
            break;
        }
    }
    free(buf);
    return found;
}

/* Reads the "offset of start of central directory" from the eocd at the given
 * file offset. In a plain zip this equals the offset of the central directory
 * relative to the zip start. In an SFX the value is relative to the ARCHIVE
 * start, so the caller must combine it with the real archive start offset. */
static long long eocd_cd_offset(const char *path, long long eocd) {
    HANDLE h = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return -1;
    BYTE buf[22];
    OVERLAPPED ov; memset(&ov, 0, sizeof(ov));
    ov.Offset = (DWORD)(eocd & 0xFFFFFFFFULL);
    ov.OffsetHigh = (DWORD)((eocd >> 32) & 0xFFFFFFFFULL);
    DWORD got = 0;
    BOOL ok = ReadFile(h, buf, sizeof(buf), &got, &ov);
    CloseHandle(h);
    if (!ok || got != sizeof(buf)) return -1;
    unsigned long cd = (unsigned long)buf[16] | ((unsigned long)buf[17] << 8) |
                       ((unsigned long)buf[18] << 16) | ((unsigned long)buf[19] << 24);
    return (long long)cd;
}

/* Reads cdir_ofs and cdir_size from the eocd at the given file offset. In an SFX
 * both are relative to the ARCHIVE start, not to the file start. */
static int eocd_cd_info(const char *path, long long eocd, long long *cdirOfs, long long *cdirSize) {
    HANDLE h = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return 0;
    BYTE buf[22];
    OVERLAPPED ov; memset(&ov, 0, sizeof(ov));
    ov.Offset = (DWORD)(eocd & 0xFFFFFFFFULL);
    ov.OffsetHigh = (DWORD)((eocd >> 32) & 0xFFFFFFFFULL);
    DWORD got = 0;
    BOOL ok = ReadFile(h, buf, sizeof(buf), &got, &ov);
    CloseHandle(h);
    if (!ok || got != sizeof(buf)) return 0;
    unsigned long sig = (unsigned long)buf[0] | ((unsigned long)buf[1] << 8) |
                        ((unsigned long)buf[2] << 16) | ((unsigned long)buf[3] << 24);
    if (sig != 0x06054b50) return 0;
    unsigned long ofs = (unsigned long)buf[16] | ((unsigned long)buf[17] << 8) |
                        ((unsigned long)buf[18] << 16) | ((unsigned long)buf[19] << 24);
    unsigned long sz = (unsigned long)buf[12] | ((unsigned long)buf[13] << 8) |
                       ((unsigned long)buf[14] << 16) | ((unsigned long)buf[15] << 24);
    *cdirOfs = (long long)ofs;
    *cdirSize = (long long)sz;
    return 1;
}

/* ------------------------------------------------------------ extract dir */

static int build_extract_dir(char *out, size_t cap) {
    const char *env = getenv("AS_ONE_EXTRACT_DIR");
    if (env && env[0]) {
        if (strlen(env) >= cap) return 0;
        strcpy(out, env);
        return 1;
    }
    char local[MAX_PATH];
    if (!SUCCEEDED(SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, local))) {
        if (!GetTempPathA(MAX_PATH, local)) return 0;
    }
    _snprintf(out, cap, "%s\\%s\\app", local, APP_SUBDIR);
    out[cap - 1] = 0;
    return 1;
}

static void sanitize_relpath(char *p) {
    for (; *p; p++) {
        if (*p == '/') *p = '\\';
    }
}

/* join base + rel, creating parents. returns 0 on failure */
static int join_path(char *out, size_t cap, const char *base, const char *rel) {
    if (_snprintf(out, cap, "%s\\%s", base, rel) < 0) return 0;
    out[cap - 1] = 0;
    return 1;
}

/* ------------------------------------------------------------ zip extract */

static int extract_zip(const char *selfPath, const char *dest) {
    mz_zip_archive zip;
    memset(&zip, 0, sizeof(zip));

    /* file_start_ofs = 0 and archive_size = 0: miniz scans the whole file for the
     * eocd, then derives archive_ofs = eocd - (cdir_ofs + cdir_size), which is
     * exactly the stub size. This is the documented "zip appended to an exe" path
     * (miniz_zip.c:796-814). */
    if (!mz_zip_reader_init_file_v2(&zip, selfPath, 0, 0, 0)) {
        fprintf(stderr, "[as-one sfx] init failed: %s (m_last_error=%u)\n",
                mz_zip_get_error_string(zip.m_last_error), (unsigned)zip.m_last_error);
        return 0;
    }

    DWORD num = mz_zip_reader_get_num_files(&zip);
    char rel[MAX_REL];

    for (DWORD i = 0; i < num; i++) {
        mz_zip_archive_file_stat st;
        if (!mz_zip_reader_file_stat(&zip, i, &st)) {
            msg("file_stat failed", NULL);
            mz_zip_reader_end(&zip);
            return 0;
        }
        if (st.m_is_directory) continue;
        if (st.m_is_encrypted) {
            msg("skipping encrypted entry", st.m_filename);
            continue;
        }

        strncpy(rel, st.m_filename, sizeof(rel) - 1);
        rel[sizeof(rel) - 1] = 0;
        sanitize_relpath(rel);

        char full[MAX_REL + MAX_PATH + 8];
        if (!join_path(full, sizeof(full), dest, rel)) {
            msg("path too long", rel);
            mz_zip_reader_end(&zip);
            return 0;
        }

        /* create parents */
        for (char *s = full + strlen(dest) + 1; *s; s++) {
            if (*s == '\\') { *s = 0; CreateDirectoryA(full, NULL); *s = '\\'; }
        }

        if (!mz_zip_reader_extract_to_file(&zip, i, full, 0)) {
            /* Capture GetLastError while it is still meaningful — the GUI build
             * has no console, so without this the user sees nothing at all. */
            DWORD err = GetLastError();
            if (err == 0) err = ERROR_ACCESS_DENIED;
            mz_zip_reader_end(&zip);
            winerr("extract failed", full, err);
            return 0;
        }
    }

    mz_zip_reader_end(&zip);
    return 1;
}

/* ---------------------------------------------------------------- launch */

static int launch_app(const char *dest) {
    char exe[MAX_PATH + 32];
    if (!join_path(exe, sizeof(exe), dest, APP_EXE_REL)) return 0;
    if (GetFileAttributesA(exe) == INVALID_FILE_ATTRIBUTES) {
        msg("app exe not found", exe);
        return 0;
    }
    STARTUPINFOA si; memset(&si, 0, sizeof(si)); si.cb = sizeof(si);
    PROCESS_INFORMATION pi; memset(&pi, 0, sizeof(pi));
    char cmd[MAX_PATH + 64];
    strcpy(cmd, "\"");
    strcat(cmd, exe);
    strcat(cmd, "\"");

    /* MUST clear ELECTRON_RUN_AS_NODE for the child.
     *
     * Electron honours this env var in its own main(): when set to 1 the binary
     * behaves as plain Node.js — no app, no window, exit 0, zero output. That is
     * exactly the "double-click did nothing" symptom.
     *
     * Where it comes from here: DSH (the host that builds and runs this project)
     * injects ELECTRON_RUN_AS_NODE=1 into the shells it spawns, so the variable is
     * inherited by every child. A user launching the SFX from a normal Explorer
     * window is unaffected, but a dev (or CI) launching it from a DSH terminal
     * would get a silent no-op unless we scrub it. Deleting it from OUR environment
     * block before CreateProcess is enough: CreateProcessA(NULL, ...) builds the
     * child's environment from the caller's process environment, not from
     * lpEnvironment (which is NULL here). */
    SetEnvironmentVariableA("ELECTRON_RUN_AS_NODE", NULL);

    BOOL ok = CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, dest, &si, &pi);
    if (!ok) { msg("CreateProcess failed", exe); return 0; }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 1;
}

int main(int argc, char **argv) {
    int headless = (argc > 1 && strcmp(argv[1], "--no-run") == 0);

    char self[MAX_PATH];
    if (!self_path(self, sizeof(self))) { msg("GetModuleFileName failed", NULL); return 1; }

    long long fileSize = 0;
    long long eocd = find_eocd(self, &fileSize);
    if (eocd < 0) { msg("no zip eocd found in stub", self); return 2; }
    (void)eocd;

    char dest[MAX_PATH];
    if (!build_extract_dir(dest, sizeof(dest))) { msg("cannot resolve extract dir", NULL); return 3; }
    if (!ensure_dirs_checked(dest)) return 3;

    fprintf(stderr, "[as-one sfx] self=%s\n[as-one sfx] fileSize=%lld\n[as-one sfx] dest=%s\n",
            self, fileSize, dest);
    fflush(stderr);

    /* Hexdump the last 64 bytes so we can see the eocd miniz is complaining about. */
    {
        FILE *f = fopen(self, "rb");
        if (f) {
            unsigned char tail[64];
            long long from = fileSize - 64;
            if (from < 0) from = 0;
            if (_fseeki64(f, from, SEEK_SET) == 0) {
                size_t n = fread(tail, 1, (size_t)(fileSize - from), f);
                fprintf(stderr, "[as-one sfx] tail(%zu):", n);
                for (size_t i = 0; i < n; i++) fprintf(stderr, " %02x", tail[i]);
                fprintf(stderr, "\n");
            }
            fclose(f);
        }
    }
    fflush(stderr);

    if (!extract_zip(self, dest)) { msg("extract failed", dest); return 4; }

    if (headless) { msg("extract-only mode, not launching", NULL); return 0; }

    if (!launch_app(dest)) return 5;
    return 0;
}
