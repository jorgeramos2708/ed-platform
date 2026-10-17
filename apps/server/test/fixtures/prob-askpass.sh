printf '%s\n' '#!/bin/sh' '[ "$1" = "Password" ] && echo "$GIT_TOKEN" || echo x' > /tmp/askpass.sh
chmod +x /tmp/askpass.sh
echo '--- contenido askpass:'
cat /tmp/askpass.sh
GIT_ASKPASS=/tmp/askpass.sh GIT_TERMINAL_PROMPT=0 git clone https://github.com/jorgeramos2708/edp-test.git /workspace 2>&1 | tail -2
echo "exit clone: $?"
