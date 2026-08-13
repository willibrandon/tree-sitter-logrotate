# Security

Report a suspected vulnerability through GitHub's private vulnerability reporting for this repository. Do not open a public issue with exploit details or sensitive material.

Generated parser code is checked for drift, native code is exercised with address and undefined behavior sanitizers, dependencies are reviewed, and scheduled fuzzing covers parser inputs. Development containers do not forward host credentials or mount the Docker socket.

Only the current release line receives security fixes before the first stable release.
