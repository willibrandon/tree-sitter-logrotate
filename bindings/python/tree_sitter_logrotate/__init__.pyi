from typing import Final
from typing_extensions import CapsuleType

HIGHLIGHTS_QUERY: Final[str] | None
"""The syntax highlighting query for this grammar."""

INJECTIONS_QUERY: Final[str] | None
"""The language injection query for this grammar."""

LOCALS_QUERY: Final[str] | None
"""The local variable query for this grammar."""

TAGS_QUERY: Final[str] | None
"""The symbol tagging query for this grammar."""

STATE_HIGHLIGHTS_QUERY: Final[str] | None
"""The syntax highlighting query for logrotate state files."""

def language() -> CapsuleType:
    """The tree-sitter language function for this grammar."""

def state_language() -> CapsuleType:
    """The tree-sitter language function for logrotate state files."""
