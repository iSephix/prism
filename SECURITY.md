# Security and supported versions

Security fixes target the latest 0.3.x release and optical formats 2 and 3. No earlier standalone package release is maintained.

Report vulnerabilities through the repository's private vulnerability reporting feature where enabled. If no private channel is available, open an issue requesting a private contact without including sensitive payloads or exploit details. A reporting email address is not yet designated.

Camera images, decoded symbols and headers are untrusted input. The public API checks types, lengths, image dimensions and supported header values. The PNG parser verifies chunk CRCs and bounds decompression. Use a worker for image decoding; search budgets are cooperative and cannot interrupt a third-party locator already executing. Browser image decompression occurs in the browser before the library sees RGBA pixels.

Text output must be inserted as text, not HTML. Do not automatically execute, evaluate, open URLs or fetch resources merely because a decoded message contains them. Recovery equations contain field coefficients and values; they are not executable scripts.

CRC32 protects against accidental corruption, not a malicious author. Encrypted results remain ciphertext until Web Crypto successfully verifies the GCM tag. Passphrase security depends on its entropy; an attacker holding a code can attempt guesses offline. There is no sender signature or key-management service. The library cannot guarantee secret erasure in garbage-collected memory.

The reference implementation has not received an independent security audit. This document describes its boundary and current handling; it does not claim formal verification.

Typed content is validated before application dispatch. Calculation markers use a bounded arithmetic parser and never JavaScript evaluation. The demo evaluates only after the Calculate action, opens links only on a click and does not autoplay audio. Filenames are metadata, never filesystem paths. Image/audio content is handled by browser codecs; failed previews retain the recovered bytes for download. Typed encryption authenticates the entire container, including type and metadata, with a context distinct from ordinary text encryption.
