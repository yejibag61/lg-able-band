@echo off
setlocal
cd /d "%~dp0"
start "LGABLEBAND_CONTEXT_AI" cmd /k "cd /d ""%~dp0ML\context"" && python server.py"
start "LGABLEBAND_WARNING_AI" cmd /k "cd /d ""%~dp0ML\warning"" && python server.py"
start "LGABLEBAND_SOUND_CHATBOT" cmd /k "cd /d ""%~dp0ML\sound_chatbot"" && python server.py"
start "LGABLEBAND_EMERGENCY_AI" cmd /k "cd /d ""%~dp0ML\emergency"" && python server.py"
