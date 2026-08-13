# Regression inputs

This directory holds minimized inputs for parser, scanner, sanitizer, and fuzz failures that do not
fit naturally in the ordinary corpus. Each input must have a deterministic test and a comment that
records its source or fuzz seed.

The fuzz workflow uploads its transcript and replay inputs when it finds a failure. Minimize the
smallest replay input, add it here, and prove that the new test fails before applying the fix.
