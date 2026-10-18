# Sources and licensing

This plugin is licensed under AGPL-3.0-only. The Android preview bridge in
`lib/preview/` is adapted from [skyjjgw/starcompanion-operit2](https://github.com/skyjjgw/starcompanion-operit2)
commit `d91dd61`, retaining the project's AGPL license. Harness integration code
and plugin lifecycle changes are included as source in this repository.

scrcpy is an external prerequisite from [Genymobile/scrcpy](https://github.com/Genymobile/scrcpy/tree/v3.3.3),
Apache-2.0. Neither its executable/server nor Android/Flutter SDKs or APKs are
distributed in this package. Install them from their official sources and retain
their notices. DeepSeek Harness is a separate MIT-licensed host; no host binary,
installation file, user profile, credential or conversation is included.

The client uses the host's public Cordis slots and sidebar tab APIs, with React
provided by the host. It does not patch the host installation or ship React.
