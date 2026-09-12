#!/bin/sh
if [ "$GIT_AUTHOR_EMAIL" = "codex@localhost" ]; then
  export GIT_AUTHOR_NAME="FKBAD Website"
  export GIT_AUTHOR_EMAIL="fkbad-website@users.noreply.github.com"
fi
if [ "$GIT_COMMITTER_EMAIL" = "codex@localhost" ]; then
  export GIT_COMMITTER_NAME="FKBAD Website"
  export GIT_COMMITTER_EMAIL="fkbad-website@users.noreply.github.com"
fi
