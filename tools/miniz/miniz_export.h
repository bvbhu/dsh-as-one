/* miniz_export.h — minimal shim.
 *
 * Upstream miniz ships this header to annotate dllexport/dllimport for Windows
 * builds of the shared library. We build a static executable, so an empty
 * MINIZ_EXPORT is correct. Created locally because the upstream file is not
 * published on the master branch (404 on raw.githubusercontent.com).
 */
#ifndef MINIZ_EXPORT_H
#define MINIZ_EXPORT_H

#define MINIZ_EXPORT

#endif /* MINIZ_EXPORT_H */
