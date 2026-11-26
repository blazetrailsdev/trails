import { Exception } from "./exception.js";

/**
 * `syserr_tbl` (`vendor/ruby/v3.3.11/error.c:2695`), keyed here by the errno
 * name the fs layer carries as `.code`: the names `set_syserr` is called with,
 * from `defs/known_errors.def`. It sits here rather than beside `Errno` in
 * `errno.ts`, which extends this class at module evaluation.
 *
 * @noRailsEquivalent PERMANENT — MRI's errno table, which Rails never reads.
 */
export const syserrTbl: ReadonlySet<string> = new Set(
  (
    "E2BIG EACCES EADDRINUSE EADDRNOTAVAIL EADV EAFNOSUPPORT EAGAIN EALREADY EAUTH " +
    "EBADARCH EBADE EBADEXEC EBADF EBADFD EBADMACHO EBADMSG EBADR EBADRPC EBADRQC " +
    "EBADSLT EBFONT EBUSY ECANCELED ECAPMODE ECHILD ECHRNG ECOMM ECONNABORTED " +
    "ECONNREFUSED ECONNRESET EDEADLK EDEADLOCK EDESTADDRREQ EDEVERR EDOM EDOOFUS " +
    "EDOTDOT EDQUOT EEXIST EFAULT EFBIG EFTYPE EHOSTDOWN EHOSTUNREACH EHWPOISON EIDRM " +
    "EILSEQ EINPROGRESS EINTR EINVAL EIO EIPSEC EISCONN EISDIR EISNAM EKEYEXPIRED " +
    "EKEYREJECTED EKEYREVOKED EL2HLT EL2NSYNC EL3HLT EL3RST ELAST ELIBACC ELIBBAD " +
    "ELIBEXEC ELIBMAX ELIBSCN ELNRNG ELOOP EMEDIUMTYPE EMFILE EMLINK EMSGSIZE " +
    "EMULTIHOP ENAMETOOLONG ENAVAIL ENEEDAUTH ENETDOWN ENETRESET ENETUNREACH ENFILE " +
    "ENOANO ENOATTR ENOBUFS ENOCSI ENODATA ENODEV ENOENT ENOEXEC ENOKEY ENOLCK " +
    "ENOLINK ENOMEDIUM ENOMEM ENOMSG ENONET ENOPKG ENOPOLICY ENOPROTOOPT ENOSPC ENOSR " +
    "ENOSTR ENOSYS ENOTBLK ENOTCAPABLE ENOTCONN ENOTDIR ENOTEMPTY ENOTNAM " +
    "ENOTRECOVERABLE ENOTSOCK ENOTSUP ENOTTY ENOTUNIQ ENXIO EOPNOTSUPP EOVERFLOW " +
    "EOWNERDEAD EPERM EPFNOSUPPORT EPIPE EPROCLIM EPROCUNAVAIL EPROGMISMATCH " +
    "EPROGUNAVAIL EPROTO EPROTONOSUPPORT EPROTOTYPE EPWROFF EQFULL ERANGE EREMCHG " +
    "EREMOTE EREMOTEIO ERESTART ERFKILL EROFS ERPCMISMATCH ESHLIBVERS ESHUTDOWN " +
    "ESOCKTNOSUPPORT ESPIPE ESRCH ESRMNT ESTALE ESTRPIPE ETIME ETIMEDOUT ETOOMANYREFS " +
    "ETXTBSY EUCLEAN EUNATCH EUSERS EWOULDBLOCK EXDEV EXFULL"
  ).split(" "),
);

/**
 * Ruby's core `StandardError` (`vendor/ruby/v3.3.11/error.c:3319` `rb_eStandardError`)
 * — the root of the ordinary rescuable hierarchy, and what a bare
 * `raise StandardError, "message"` builds.
 *
 * The fs layer's coded errors (`"EACCES"`) are {@link SystemCallError}s
 * (`errno.ts`), so they are this class too, as `Errno::*` is under
 * `rescue StandardError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `StandardError`, which Rails
 * inherits rather than defines.
 */
export class StandardError extends Exception {
  /** @noRailsEquivalent PERMANENT */
  static [Symbol.hasInstance](error: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, error) ||
      (this === StandardError &&
        error instanceof Error &&
        syserrTbl.has(String((error as { code?: unknown }).code)))
    );
  }
}
