// An error the web UI can put into words in the user's own language (#26).
//
// The server used to throw Japanese sentences and send them verbatim, so an
// English UI showed e.g. "Failed to re-link: 自分の中身…". The UI already
// translates everything it writes itself through each module's STRINGS table;
// for errors that originate here, the server now sends a stable `code` (plus
// the values the sentence needs) and the UI looks the sentence up. `message`
// stays a readable sentence for logs, tests and any client that doesn't know
// the code.

export class CodedError extends Error {
  readonly code: string;
  readonly params: Record<string, string>;
  constructor(code: string, message: string, params: Record<string, string> = {}) {
    super(message);
    this.code = code;
    this.params = params;
  }
}

/** The JSON body the API sends for a CodedError. */
export interface CodedErrorBody {
  code: string;
  params: Record<string, string>;
  message: string;
}
