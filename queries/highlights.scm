; Comments

(comment) @comment

; Paths and values

[
  (path_pattern)
  (quoted_path)
] @string.special.path

(quoted_argument) @string
(escape_sequence) @string.escape

[
  (integer)
  (size)
] @number

; Structural and known directive names

((directive
   name: (directive_name) @property)
 (#not-match? @property "^(addextension|allowhardlink|compress|compresscmd|compressext|compressoptions|copy|copytruncate|create|createolddir|daily|dateext|dateformat|datehourago|dateyesterday|delaycompress|errors|extension|firstaction|hourly|ifempty|ignoreduplicates|lastaction|mail|mailfirst|maillast|maxage|maxsize|minage|minsize|minutes|missingok|monthly|noallowhardlink|nocompress|nocopy|nocopytruncate|nocreate|nocreateolddir|nodateext|nodatehourago|nodateyesterday|nodelaycompress|nomail|nomissingok|noolddir|norenamecopy|nosharedscripts|noshred|notifempty|olddir|postrotate|preremove|prerotate|renamecopy|rotate|sharedscripts|shred|shredcycles|size|start|su|tabooext|taboopat|uncompresscmd|weekly|yearly)$"))

((directive
   name: (directive_name) @keyword)
 (#match? @keyword "^(addextension|allowhardlink|compress|compresscmd|compressext|compressoptions|copy|copytruncate|create|createolddir|daily|dateext|dateformat|datehourago|dateyesterday|delaycompress|errors|extension|firstaction|hourly|ifempty|ignoreduplicates|lastaction|mail|mailfirst|maillast|maxage|maxsize|minage|minsize|minutes|missingok|monthly|noallowhardlink|nocompress|nocopy|nocopytruncate|nocreate|nocreateolddir|nodateext|nodatehourago|nodateyesterday|nodelaycompress|nomail|nomissingok|noolddir|norenamecopy|nosharedscripts|noshred|notifempty|olddir|postrotate|preremove|prerotate|renamecopy|rotate|sharedscripts|shred|shredcycles|size|start|su|tabooext|taboopat|uncompresscmd|weekly|yearly)$"))

(include_directive
  name: (directive_name) @keyword)

[
  (script_directive)
  (endscript)
] @keyword

; Punctuation

"=" @operator

[
  "{"
  "}"
] @punctuation.bracket
