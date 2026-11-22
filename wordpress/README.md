# Plugins de WordPress para la tienda

Copias de los *mu-plugins* instalados en `tienda.taxlockedwallet.com`
(`public_html/tienda/wp-content/mu-plugins/`). Los *mu-plugins* se activan solos;
para quitar uno basta con borrar el archivo del servidor.

| Archivo | Para qué |
|---|---|
| `ckoido-cors.php` | Permite que `https://taxlockedwallet.com` llame a la Store API (carrito y checkout). |
| `ckoido-cuenta.php` | Login, registro, recuperar contraseña y «Mi cuenta» (perfil y pedidos) con un token propio (`X-CKOido-Token`). Con el token, la Store API reconoce al cliente y sus pedidos quedan en su cuenta. |

Si se cambia uno aquí, hay que volver a subirlo al servidor (no se despliega con GitHub Actions).
