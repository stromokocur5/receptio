# Ceny z domáceho počítača

`api.cenyslovensko.sk` neodpovedá GitHub runnerom ani Cloudflare Workerom (timeout / 522), preto
ceny každé ráno sťahuje počítač doma: `scripts/sync-prices-local.sh` vo vlastnom klone repa
(`~/.local/share/receptio-ceny`) stiahne ceny, overí ich testami, commitne a pushne – push na
`main` spustí nasadenie.

Inštalácia (systemd user timer):

```sh
mkdir -p ~/.config/systemd/user
cp scripts/systemd/receptio-ceny.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now receptio-ceny.timer
```

- Spustiť hneď: `systemctl --user start receptio-ceny.service`
- Log: `journalctl --user -u receptio-ceny.service`
- Kedy pobeží: `systemctl --user list-timers receptio-ceny.timer`

Timer beží, len keď si prihlásený; zmeškané ráno dobehne pri prihlásení (`Persistent=true`). Aby
bežal aj bez prihlásenia: `sudo loginctl enable-linger $USER`.
