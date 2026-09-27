#!/usr/bin/env python3
# Обновить справочные цены Mercadona (Валенсия): python3 scripts/update-prices.py
# Берёт цены с tienda.mercadona.es (открытый API сайта) и переписывает src/data/refPrices.ts.
# Если товар пропал из магазина, он будет в списке missing — поправьте название в таблице M ниже.
import os
import json, urllib.request, time
cats=[38,37,40,44,31,34,32,27,29,28,77,72,75,53,54,56,48,52,50,51,118,120,121,126,122,127,112,115,116,117,90,69,60,59,62,104,145,83,92,133,135,129,89,130,147,148,78,86]
out=[]
for c in cats:
    req=urllib.request.Request(f"https://tienda.mercadona.es/api/categories/{c}/?lang=es&wh=vlc1", headers={"User-Agent":"Mozilla/5.0"})
    d=json.load(urllib.request.urlopen(req, timeout=30))
    for sub in d.get('categories',[]):
        for p in sub.get('products',[]):
            pi=p['price_instructions']
            out.append({"cat":d['name'],"sub":sub['name'],"name":p['display_name'],"pack":p.get('packaging'),
                        "price":pi.get('unit_price'),"bulk":pi.get('bulk_price'),"ref":pi.get('reference_format'),
                        "size":pi.get('unit_size'),"fmt":pi.get('size_format')})
    time.sleep(0.3)
items=out
print('товаров:', len(out))

# ключ: (название в Mercadona, упаковка или None, «за сколько» в единицах каталога)
# Для «шт» — текст количества (штуки, банки, пачки); для «г» — None: возьмём вес упаковки.
M = [
 ('картошка','Patatas','Malla','≈33 картофелины (5 кг)'),
 ('лук','Cebollas','Malla','≈7 луковиц (1 кг)'),
 ('лук красный','Cebollas rojas','Malla','≈3 луковицы (0,5 кг)'),
 ('лук зелёный','Cebollas tiernas','Manojo','1 пучок'),
 ('лук-порей','Puerros','Manojo','3 стебля'),
 ('морковь','Zanahorias','Paquete','≈10 морковок (1 кг)'),
 ('чеснок','Ajos morados','Malla','5 головок'),
 ('свёкла варёная','Remolacha cocida y pelada','Paquete','1 упаковка'),
 ('капуста','Repollo liso partido','1/2 Pieza','½ кочана'),
 ('брокколи','Brócoli','Pieza','1 кочан'),
 ('цветная капуста','Coliflor','Pieza','1 кочан'),
 ('кабачок','Calabacín verde','Pieza','1 кабачок'),
 ('баклажан','Berenjena','Pieza','1 баклажан'),
 ('перец болгарский','Pimiento rojo','Pieza','1 перец'),
 ('помидоры','Tomates','Malla','≈13 помидоров (2 кг)'),
 ('помидоры черри','Tomates cherry','Bandeja','1 упаковка'),
 ('огурцы','Pepino','Pieza','1 огурец'),
 ('огурцы солёные','Pepinillos agridulces Hacendado','Tarro','1 банка'),
 ('шампиньоны','Champiñones blancos','Bandeja',None),
 ('авокадо','Aguacate','Pieza','1 авокадо'),
 ('салат','Lechuga Iceberg','Pieza','1 кочан'),
 ('рукола','Rúcula lavada','Paquete','1 пачка'),
 ('шпинат','Espinacas cortadas y lavadas','Paquete','1 пачка'),
 ('кукуруза','Maíz dulce Hacendado','Pack-3','3 банки'),
 ('горошек','Guisantes extra Hacendado','Bote','1 банка'),
 ('фасоль стручковая','Judía verde plana','Bandeja',None),
 ('овощи замороженные','Salteado de verduras Hacendado ultracongelado','Paquete','1 пакет'),
 ('имбирь','Jengibre',None,'1 корень'),
 ('петрушка','Perejil troceado lavado','Paquete','1 пучок'),
 ('кинза','Cilantro','Bandeja','1 пучок'),
 ('базилик','Albahaca','Bandeja','1 пучок'),
 ('лимон','Limones','Malla','≈8 лимонов (1 кг)'),
 ('банан','Plátano de Canarias IGP','Pieza','1 банан'),
 ('яблоко','Manzanas rojas dulces',None,'≈8 яблок'),
 ('апельсин','Naranjas','Malla','≈15 апельсинов (3 кг)'),
 ('курица','Medio pollo troceado','Bandeja',None),
 ('куриное филе','Filetes pechuga de pollo','Bandeja',None),
 ('куриные бёдра','Contramuslos de pollo deshuesados y sin piel','Bandeja',None),
 ('куриные голени','Jamoncitos de pollo','Bandeja',None),
 ('куриные крылышки','Alas partidas de pollo','Bandeja',None),
 ('индейка','Filetes pechuga de pavo','Bandeja',None),
 ('фарш куриный','Preparado de carne picada pollo','Bandeja',None),
 ('фарш','Preparado de carne picada vacuno y cerdo','Bandeja',None),
 ('фарш говяжий','Preparado de carne picada vacuno','Bandeja',None),
 ('свинина','Lomo de cerdo trozo','Pieza',None),
 ('свиные рёбрышки','Costilla de cerdo churrasco',None,None),
 ('говядина','Filetes de vacuno añojo para plancha','Bandeja',None),
 ('бекон','Bacón Hacendado cintas',None,None),
 ('ветчина','Jamón cocido Hacendado finas lonchas',None,None),
 ('хамон','Jamón serrano Incarlopsa lonchas','Paquete',None),
 ('чоризо','Chorizo dulce extra Hacendado','Pieza',None),
 ('лосось','Rodaja de salmón','Bandeja',None),
 ('хек','Filetes de merluza del Cabo sin piel Hacendado ultracongelados','Paquete',None),
 ('треска','Filetes de bacalao MareDeus ultracongelado','Paquete',None),
 ('тунец','Atún claro en aceite de girasol Hacendado','Pack-3','3 банки'),
 ('креветки','Gamba pelada cruda tamaño mediano Hacendado ultracongelada','Paquete',None),
 ('крабовые палочки','Palitos de surimi Hacendado ultracongelados','Paquete','1 упаковка'),
 ('молоко','Leche entera Hacendado','Brik','1 пакет'),
 ('сливки','Nata ligera para cocinar Hacendado','Brik','1 пакет'),
 ('масло сливочное','Mantequilla con sal Hacendado','Pastilla',None),
 ('творог','Queso fresco batido desnatado 0% MG Hacendado','Tarrina','1 пачка'),
 ('йогурт','Yogur natural con azúcar de caña Hacendado','Pack-6','6 стаканчиков'),
 ('сыр','Queso rallado especial fundir mezcla Hacendado','Paquete',None),
 ('гауда','Queso tierno gouda de vaca Hacendado','Pieza',None),
 ('эдам','Queso tierno bola edam de vaca Holland Corona','Pieza',None),
 ('моцарелла','Mozzarella fresca de vaca Hacendado','Paquete',None),
 ('пармезан','Queso grana padano Zanetti','Pieza',None),
 ('фета','Queso feta mezcla Hacendado en dados','Tarrina',None),
 ('плавленый сыр','Queso en porciones Hacendado','Caja','1 упаковка'),
 ('сливочный сыр','Queso untar suave de vaca Hacendado','Tarrina','1 банка'),
 ('яйца','Huevos grandes L','Paquete','12 яиц'),
 ('рис','Arroz redondo Hacendado','Paquete',None),
 ('спагетти','Spaghetti Hacendado','Paquete',None),
 ('макароны','Macarrón Hacendado','Paquete',None),
 ('вермишель','Fideo mediano Hacendado','Paquete',None),
 ('лапша для вока','Noodles Ramen','Paquete','1 пачка'),
 ('листы лазаньи','Placas para lasaña precocidas El Pavo','Caja','1 пачка'),
 ('овсянка','Copos de avena Brüggen','Caja',None),
 ('хлопья','Cereales copos de maíz Corn Flakes Kellogg\'s','Caja','1 пачка'),
 ('кускус','Cous cous mediano Hacendado','Caja',None),
 ('чечевица','Lenteja pardina Hacendado','Paquete',None),
 ('нут','Garbanzo cocido Hacendado','Tarro','1 банка'),
 ('фасоль','Alubia cocida blanca Hacendado','Tarro','1 банка'),
 ('мука','Harina de trigo Hacendado','Paquete',None),
 ('сахар','Azúcar blanco Hacendado','Paquete',None),
 ('хлеб','3 Barras de pan',None,'3 батона'),
 ('хлеб для тостов','Pan de molde blanco Hacendado','Paquete','1 пачка'),
 ('багет','Baguette masa madre',None,'1 багет'),
 ('тортильи','Tortillas de trigo Hacendado','Paquete','1 пачка'),
 ('слоёное тесто','Masa fresca hojaldre Hacendado',None,'1 упаковка'),
 ('томаты в банке','Tomate triturado Hacendado','Bote','1 банка'),
 ('томато фрито','Tomate frito Hacendado','Pack-3','3 банки'),
 ('томатная паста','Tomate doble concentrado Hacendado extra','Bote','1 банка'),
 ('кокосовое молоко','Preparado de coco Hacendado','Bote','1 банка'),
 ('соус карри','Salsa curry Tikka Masala Hacendado picante','Paquete','1 банка'),
 ('соевый соус','Salsa de Soja Hacendado','Botella','1 бутылка'),
 ('майонез','Mayonesa Hacendado','Tarro','1 банка'),
 ('кетчуп','Ketchup Hacendado','Bote','1 бутылка'),
 ('горчица','Mostaza clásica Hacendado','Bote','1 банка'),
 ('песто','Salsa Pesto con albahaca Hacendado','Tarro','1 банка'),
 ('оливки','Aceitunas verdes con hueso Hacendado','Tarro','1 банка'),
 ('мёд','Miel de flores Hacendado','Tarro','1 банка'),
 ('варенье','Mermelada de melocotón Hacendado','Tarro','1 банка'),
 ('арахисовая паста','Crema de cacahuete 100% Hacendado','Tarro','1 банка'),
 ('масло оливковое','Aceite de oliva virgen extra Hacendado','Botella','1 бутылка'),
 ('масло растительное','Aceite de girasol refinado 0,2º Hacendado','Botella','1 бутылка'),
 ('уксус','Vinagre de vino blanco Hacendado','Botella','1 бутылка'),
 ('орехи','Nuez natural Hacendado','Paquete',None),
 ('арахис','Cacahuete tostado con sal Hacendado','Paquete',None),
 ('кофе','Café molido natural Hacendado','Paquete','1 пачка'),
 ('шоколад','Chocolate con leche classic Hacendado extrafino','Tableta','1 плитка'),
 ('перец чёрный','Pimienta negra molida Hacendado','Bote','1 банка'),
]
out=[]; miss=[]
for key,name,pack,per in M:
    c=[it for it in items if it['name']==name and (pack is None or it['pack']==pack)]
    if not c: miss.append((key,name,pack)); continue
    it=c[0]
    price=float(it['price'])
    if per is None:
        size=it['size']
        if size and it['fmt'] in ('kg','l'):
            g=round(float(size)*1000)
            per=f"{g} г" if g<1000 else (f"{g/1000:g} кг".replace('.',','))
        else:
            per='1 кг'; price=float(it['bulk'])
    out.append({'key':key,'item':f"{it['name']}" + (f" ({it['pack']})" if it['pack'] else ''),'price':round(price,2),'per':per})
print('missing',miss)
today=time.strftime("%d.%m.%Y")
lines=[f"// Справочные цены Mercadona (магазины Валенсии, tienda.mercadona.es, склад vlc1), снято {today}.",
"// По одному типичному товару на продукт каталога. Обновить: python3 scripts/update-prices.py",
"// Carrefour и Kuups цены онлайн не отдают — их цены приложение узнаёт от вас.",
"",
f"export const REF_DATE = '{today}';",
"export const REF_STORE = 'Mercadona';",
"",
"export interface RefPrice {",
"  /** Товар в магазине. */",
"  item: string;",
"  price: number;",
"  /** За сколько — в единицах каталога. */",
"  per: string;",
"}",
"",
"export const REF_PRICES: Record<string, RefPrice> = {"]
for o in out:
    lines.append(f"  {json.dumps(o['key'],ensure_ascii=False)}: {{ item: {json.dumps(o['item'],ensure_ascii=False)}, price: {o['price']}, per: {json.dumps(o['per'],ensure_ascii=False)} }},")
lines.append("};")
open(os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'refPrices.ts'), 'w').write('\n'.join(lines)+'\n')
print(len(out))
