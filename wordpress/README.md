# Plugins de WordPress para la tienda

Copias de los plugins instalados en `tienda.taxlockedwallet.com`. Funcionan como *mu-plugins*
(`wp-content/mu-plugins/`, se activan solos) o como plugins normales (Plugins → Añadir → Subir un .zip
con la carpeta del plugin). En Tindershop están instalados como plugins normales.

| Archivo | Para qué |
|---|---|
| `tindershop-cors.php` | Permite que `https://taxlockedwallet.com` llame a la Store API (carrito y checkout). |
| `tindershop-cuenta.php` | Login, registro, recuperar contraseña y «Mi cuenta» (perfil y pedidos) con un token propio (`X-Tindershop-Token`, rutas `/wp-json/tindershop/v1/`). Con el token, la Store API reconoce al cliente y sus pedidos quedan en su cuenta. |
| `tindershop-ajustes.php` | **Ajustes → Tindershop**: elige qué ve el cliente al entrar (tarjetas deslizables o tienda 3D). En cada categoría de productos, «Exhibición en la tienda 3D» (góndola, perchero, maniquí, estante, exhibidor). En cada producto (Datos del producto → General) se puede elegir otra exhibición; vacío = la de su categoría. «Letreros de los pasillos» (uno por línea). Música de la tienda 3D. Republica el sitio cuando empiezan o terminan las ofertas programadas. Presencia de compradores para el multijugador (`POST /tindershop/v1/presencia`, sin datos personales, se borra a los 12 s). Ruta pública `/wp-json/tindershop/v1/ajustes`; al cambiar algo pide un build nuevo. |
| `tienda-publicar.php` | Al guardar productos, opiniones o banners, pide a GitHub que vuelva a publicar el sitio. Se configura en Ajustes → Publicar sitio. |

Si se cambia uno aquí, hay que volver a subirlo al servidor (no se despliega con GitHub Actions).
