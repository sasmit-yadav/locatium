# Fatehabad collector rates from pages p-11.png through p-20.png
# rate = Proposed Rate 2025-26 as ₹/sq yd (acre rates converted: round(acre/4840, 2))
# tuple: (tehsil, village, segment, sector_type, rate_per_sq_yard_inr)

ROWS = [
    # --- p-11 Tehsil Fatehabad urban (sr 135-148) ---
    ("Fatehabad", "Fatehabad", "रतिया मोड़ से सिरसा चुंगी व्यवसायिक 286//26 मिन, 312//26,27, 314//1,2,3,26 ता 48, 315//1,2,3,4,5,26,27,445 मौजा फतेहाबाद", "commercial", 80000),
    ("Fatehabad", "Fatehabad", "सभी कालोनियों के फ्लैट का रेट (Ground Floor)", "residential", 15000),
    ("Fatehabad", "Fatehabad", "सभी कालोनियों के फ्लैट का रेट (Ist Floor)", "residential", 13000),
    ("Fatehabad", "Fatehabad", "सभी कालोनियों के फ्लैट का रेट (IInd Floor)", "residential", 9000),
    ("Fatehabad", "Fatehabad", "शहर की गलियों में स्थित (कम्पलैक्स) के रेट (Ground Floor)", "commercial", 80000),
    ("Fatehabad", "Fatehabad", "शहर की गलियों में स्थित (कम्पलैक्स) के रेट (Basement, First Floor)", "commercial", 50000),
    ("Fatehabad", "Fatehabad", "शहर की गलियों में स्थित (कम्पलैक्स) के रेट (Second Floor)", "commercial", 37000),
    ("Fatehabad", "Fatehabad", "शहर की गलियों में स्थित दुकानों का रेट। (व्यवसायिक) (Ground Floor)", "commercial", 28000),
    ("Fatehabad", "Fatehabad", "शहर की गलियों में स्थित दुकानों का रेट। (व्यवसायिक) (Basement & First Floor)", "commercial", 16000),
    ("Fatehabad", "Fatehabad", "नगरपालिका सीमा के बाहर के प्लाट फतेहाबाद व्यवसायिक", "commercial", 6000),
    ("Fatehabad", "Fatehabad", "Old Rest House पटवार खाना गुरुद्वारा नज. धर्मशाला खसरा न 395//1 to 25", "commercial", 7500),
    ("Fatehabad", "Fatehabad", "Shiv Hans City Center (Shopping Mall) Model Town Fatehabad Mouja Fatehabad (Ground Floor)", "commercial", 85000),
    ("Fatehabad", "Fatehabad", "Shiv Hans City Center (Shopping Mall) Model Town Fatehabad Mouja Fatehabad (First Floor)", "commercial", 80000),
    ("Fatehabad", "Fatehabad", "Shiv Hans City Center (Shopping Mall) Model Town Fatehabad Mouja Fatehabad (Second Floor)", "commercial", 75000),
    ("Fatehabad", "Fatehabad", "Shiv Hans City Center (Shopping Mall) Model Town Fatehabad Mouja Fatehabad (Third Floor)", "commercial", 70000),
    ("Fatehabad", "Fatehabad", "Shiv Hans City Center (Shopping Mall) Model Town Fatehabad Mouja Fatehabad (Forth Floor)", "commercial", 65000),
    ("Fatehabad", "Fatehabad", "Shiv Hans City Center (Shopping Mall) Model Town Fatehabad Mouja Fatehabad (Basement 1)", "commercial", 65000),
    ("Fatehabad", "Fatehabad", "Shiv Hans City Center (Shopping Mall) Model Town Fatehabad Mouja Fatehabad (Basement 2)", "commercial", 60000),
    ("Fatehabad", "Fatehabad", "Shiv Hans City Center (Shopping Mall) Model Town Fatehabad Mouja Fatehabad (Construction) 1200 प्रति वर्गफुट", "commercial", 10800),  # 1200/sq ft * 9
    ("Fatehabad", "Fatehabad", "बीमा कालोनी 339//13,14,15,16 मिन,17 मिन,18 मिन,23,24,25, 338//18 ता 23, 342//3,4,5,6 मौजा फतेहाबाद", "residential", 5700),
    ("Fatehabad", "Fatehabad", "भाटिया कालोनी 190//18/1 ता 26/1/2/1, 216//12/2,13/2,17,18,19,20/2/1,21/2,22/1,23,24,25, 217//1/1,2/2 ता 9/1,16/2,17/2,23,24,25, 233//3 ता 8,13 ता 18,23,24,25 मिन, 234//1 ता 25, 235//1,2 ता 8,13 ता 19,22,23,24,25, 238//25, 268//1 ता 6/1,8/2,9,10,11/1,12,13,18 ता 23/2, 269//3 ता 8,13 ता 19,22,23,24,25 मौजा फतेहाबाद", "residential", 3500),
    # --- p-12 (sr 149-165) ---
    ("Fatehabad", "Fatehabad", "सूर्या एनक्लेव 339//1, 340//2 मिन,3,4 मिन,5 मिन,6/1,6/2,7,8,9 मिन मौजा फतेहाबाद", "residential", 6000),
    ("Fatehabad", "Fatehabad", "डी0सी0 कालोनी/रामनगर कालोनी 339//1,2,3 मिन,8 मिन,9,10,11,12,13 मिन,18 मिन,19,20,21,22,23 मिन, 340//5 मिन,6,13,14,15,16,17,18,23 मिन,24 मिन,25 मिन, 342//1,2,3 मिन,9 मिन,10 मिन मौजा फतेहाबाद", "residential", 5500),
    ("Fatehabad", "Fatehabad", "प्रोफेसर कालोनी 235//7,8,9,10,11,12,14,15,20,21, 267//1 मौजा फतेहाबाद", "residential", 5500),
    ("Fatehabad", "Fatehabad", "गीता कालोनी 315//3 मिन,4 मिन,5 मिन,6,7,8,13,14,15,16,17,18,23 मिन,24 मिन,25 मिन, 314//6 ता 15,16 मिन,17 मिन,18 ता 20,21 मिन,22 मिन मौजा फतेहाबाद", "residential", 5500),
    ("Fatehabad", "Fatehabad", "चौधरी कालोनी 338//8 ता 13, 339//6,7,8,13 मिन,14 मिन,15 मिन मौजा फतेहाबाद", "residential", 5500),
    ("Fatehabad", "Fatehabad", "शक्ति नगर मौजा फतेहाबाद (न0पा0 सीमा के अन्दर) मुरब्बा नम्बर 193,194,214//1 मिन ता 25/2, 215//6/2,14 मिन,15,16,17,18 मिन,23 ता 25,26, 236//3 मिन,4,5,6 मिन,7 मिन,26, 237//1 मिन ता 6,15/1,15/2,16/1,16/2,25,25/1,25/2,26, 265//11/4,26/1,28,34/1,37/1/2", "residential", 2800),
    ("Fatehabad", "Fatehabad", "इन्द्रपुरा मोहल्ला 264//1,2,3,4,7,8,9,10,11,12,13,14, 265//2,4,5,6,7,14,15, 238//1 ता 25, 239//21,22, 263//1,2,9/1,9/2,10/1,10/2,26, 264//5,6/1,6/1/1,6/1/2,6/2/1,6/2/2 प्लाट न0 810 ता 883,892,897,898", "residential", 3200),
    ("Fatehabad", "Fatehabad", "गुरुनानक पुरा मोहल्ला/ईम्पलाईज कालोनी 215//28, 235//15 मिन,16,24,25, 236//2,3,4 मिन,7 मिन,8,9,10 मिन ता 14,15 मिन,16,17 मिन,18,19,20,21,22,23,24 मिन,25, 266//1,2,3,4,8,9,10, 267//3 मिन,4,5, 215//28, 236//26 ता 48, 267//6,7,8 मिन प्लाट न0 382,386,389 मौजा फतेहाबाद", "residential", 3700),
    ("Fatehabad", "Fatehabad", "गुरुद्वारा से पुरानी तहसील, मोहल्ला रामनिवास, गढ़ी मोहल्ला, पुलिस मोहल्ला, जण्डी मोहल्ला, लंग मोहल्ला (पुरानी लकीर के अन्दर) 288//8,9,13,14/1,14/2,15,16/1,16/2,17,18/1,18/2,24 ता 30, 311//5 मौजा फतेहाबाद प्लाट न0 337,365,373 ता 377,381,392,571 ता 578,579/1,2,3,580,581,582/1,2,583 ता 592,593/1,594,595/1,2,3,4,5,637,667", "residential", 3200),
    ("Fatehabad", "Fatehabad", "ठाकर बस्ती मौजा फतेहाबाद (रिहायशी) 287//14 प्लाट न0 378,379,443,444,446,447,909 ता 913, 312//26", "residential", 5500),
    ("Fatehabad", "Fatehabad", "शास्त्री नगर कालोनी (आबादी) 84//2 मिन,3,4,5,6,7,8 मिन मौजा बस्ती भीवा 289//18 मिन,19 मिन,22 मिन,23,26,30 ता 70 प्लाट न0 514 ता 541 मौजा फतेहाबाद गैर मुस्तकिल", "residential", 2700),
    ("Fatehabad", "Fatehabad", "रेगर बस्ती (पुरानी आबादी) मौजा फतेहाबाद 288//19 प्लाट न0 311,377,771,772,776", "residential", 3300),
    ("Fatehabad", "Fatehabad", "अप्पू नगर (पुरानी आबादी) मौजा फतेहाबाद", "residential", 5500),
    ("Fatehabad", "Fatehabad", "बरनाला कालोनी 341//3,4,5, 342//1,2,10/1 मौजा फतेहाबाद", "residential", 5000),
    ("Fatehabad", "Fatehabad", "राजीव कालोनी 336//22,23 मौजा फतेहाबाद", "residential", 4000),
    ("Fatehabad", "Fatehabad", "नई प्रोफेसर कालोनी 216//2,3,13/3,14/1,22/2, 235//2/2,3,4,5,6/2 मौजा फतेहाबाद", "residential", 5000),
    ("Fatehabad", "Fatehabad", "हरनाम सिंह कालोनी मौजा फतेहाबाद (न0पा0 सीमा के अन्दर) मुरब्बा नम्बर 307,308,347//5,6,15,16, 348//1,2/1,2/2,9/2,10,11,11/1,11/2,11/3,11/4,12/1,19/2,20/1,20/2", "residential", 2600),
    # --- p-13 (sr 166-178) ---
    ("Fatehabad", "Fatehabad", "कीरती नगर (न0पा0 सीमा के अन्दर) 232//5,6, 233//1/1,1/2,19,9/2,10/1,10/2 मौजा फतेहाबाद", "residential", 2600),
    ("Fatehabad", "Fatehabad", "उग्रसैन कालोनी 281//15,16,17,18,19,20 ता 25, 319//1 ता 4,7 ता 14,17 ता 25, 323//1 ता 4,7 ता 12,13/1 मौजा फतेहाबाद", "residential", 2600),
    ("Fatehabad", "Fatehabad", "आजाद नगर मौजा फतेहाबाद (न0पा0 सीमा के अन्दर) 183//1 ता 25, 189//22,23,24,25, 218//1,2,2/2,3 ता 10,11/2,12 ता 19,20/1,21/2,22,23/1,23/2 मुरब्बा नम्बर 215 से 219,223,224", "residential", 2600),
    ("Fatehabad", "Fatehabad", "गाँधी कालोनी 175//21/1/2, 176//16/1/2,25/1/1,25/1/2, 190//4,5,24/1,25,26/1/1,26/2,21/2,18/1,18/2,22/2,23/2,24/2,26/1/2/1,23/1, 191//1/1,10/1/2,10/2,11/1,11/2,20/1/1,20/2, 217//1/1,2/1,3/1,3/1/1,3/2/2,8/2,9/1,8/1 मौजा फतेहाबाद", "residential", 2600),
    ("Fatehabad", "Fatehabad", "बगीची मोहल्ला (रिहायशी) 287//14 प्लाट नं0 378,379,443,444,446,447,909 ता 913 मौजा फतेहाबाद", "residential", 3000),
    ("Fatehabad", "Fatehabad", "आबादी देह मौजा फतेहाबाद :- 269/29,380,390,514,515,520 to 592,644 to 708,714 to 758,774,775,776/1,788,789,791/1,791 to 800,805,807,806/1,2,808,809,836/1,839/2,856,869,885/1,886 to 888,894 to 898,899/1,2,900,901,903,904,905/2,906", "residential", 6200),
    ("Fatehabad", "Fatehabad", "इन्डस्ट्रीयल एरिया मण्डी के पीछे प्लाट नं0 448,766 ता 799 (रिहायशी)", "residential", 9000),
    ("Fatehabad", "Fatehabad", "आर के कालोनी एव न्यू आर के कालोनी / गुरनाम सिंह कालोनी 335//24, 336//3,4,5,6 मिन,7 मिन,8 मिन,9 ता 19, 337//1 ता 23 मौजा फतेहाबाद", "residential", 5200),
    ("Fatehabad", "Fatehabad", "अम्बेडकर कालोनी 262//1,2/1,2/2,2/3,2/4,3,4/1,4/2/1,4/2/2,5/1,5/2 to 25, 263//1 to 10,14,17,24,25,26, 264//1 to 11,26 to 35, 265//4,5,15,26 to 37, 289//1 to 14,18 to 23, 290//1 to 15,16,17,18,19,20,21,22,23,24/1,24/2, 309//1/1/1,1/2,2/3/1,2/2/1,2/2/2,2/3/3,1/4/1,1/3,2/1,9/2 मौजा फतेहाबाद", "residential", 3500),
    ("Fatehabad", "Fatehabad", "खैराती खेड़ा रोड ऑफिसर कालोनी से अग्रवाल पेपर वार्ड तक 314//16,17,18,19,20, 315//21,22,23,24,25, 316//21,23,24,25, 326//1,2,3,4,5, 325//1,2,3,4,5 मौजा फतेहाबाद", "residential", 3500),
    ("Fatehabad", "Fatehabad", "नगरपालिका सीमा के बाहर के प्लाट फतेहाबाद रिहायशी", "residential", 2700),
    # कृषि भूमि — document labels some as प्रति वर्गगज but values match प्रति एकड़; convert /4840
    ("Fatehabad", "Fatehabad", "रतिया चुंगी से हांसपुर कैंची तक व रतिया चुंगी से हनुमान मन्दिर तक 175//20,21,19,22, 191//1,2,9/1,9/2,9/3,10/1,10/2,11/1,11/2,12,13,14,17,18,19/1,19/2,23 ता 25, 216//4/1,4/2,5,6/1,6/2,7/1,7/2,15/1,15/2, 215//2,5,6,11,15,16,17,20/1,23/2,24,24/1", "agricultural", 1033.06),  # 5000000/acre
    ("Fatehabad", "Fatehabad", "रतिया चुंगी से हांसपुर कैंची तक व रतिया चुंगी से हनुमान मन्दिर तक 2 एकड़ हटकर", "agricultural", 1033.06),  # 5000000/acre
    # --- p-14 (sr 179-185) agricultural roadside; acre values labeled वर्गगज — convert ---
    ("Fatehabad", "Fatehabad", "सिरसा रोड से चुंगी (न0पा0 सीमा के बाहर) मौजा फतेहाबाद सड़क से 2 एकड़ तक 279,280,281,282,283,284,285,286,316,317,318", "agricultural", 2685.95),  # 13000000/acre
    ("Fatehabad", "Fatehabad", "सिरसा रोड से चुंगी (न0पा0 सीमा के बाहर) मौजा फतेहाबाद सड़क से 2 एकड़ हटकर", "agricultural", 1652.89),  # 8000000/acre
    ("Fatehabad", "Fatehabad", "फतेहाबाद से रतिया रोड हांसपुर रोड मौजा फतेहाबाद 2 एकड़ तक (न0पा0 सीमा के बाहर) 134,135,152,172,173", "agricultural", 1033.06),  # 5000000/acre
    ("Fatehabad", "Fatehabad", "फतेहाबाद से रतिया रोड हांसपुर रोड मौजा फतेहाबाद 2 एकड़ हटकर (न0पा0 सीमा के बाहर) 215//26", "agricultural", 867.77),  # 4200000/acre
    ("Fatehabad", "Fatehabad", "फतेहाबाद से बीघड़ रोड (न0पा0 सीमा के बाहर) मौजा फतेहाबाद सड़क पर 2 एकड़ तक 342,345,348", "agricultural", 991.74),  # 4800000/acre
    ("Fatehabad", "Fatehabad", "फतेहाबाद से बीघड़ रोड (न0पा0 सीमा के बाहर) मौजा फतेहाबाद सड़क से 2 एकड़ हटकर", "agricultural", 867.77),  # 4200000/acre
    ("Fatehabad", "Fatehabad", "बाईपास के दोनों तरफ 2-2 एकड़ तक मौजा फतेहाबाद 173,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,191,192,193,194,195,212,213,240,241,261,292,293", "agricultural", 1859.5),  # 9000000/acre
    # --- p-15 (sr 186-189, 189क-घ) ---
    ("Fatehabad", "Fatehabad", "खानमोहम्मद से ढाणी ढोबा तक मौजा फतेहाबाद मुरब्बा नम्बर 1 से 60 तक", "agricultural", 516.53),  # 2500000/acre
    ("Fatehabad", "Fatehabad", "नगरपालिका सीमा के अन्दर यदि गैर मुमकिन रकबा 1000 वर्गगज से अधिक बैय होता है तो उसका कलेक्टर रेट", "residential", 382.23),  # 1850000/acre
    ("Fatehabad", "Fatehabad", "सिरसा रोड मौजा फतेहाबाद (न0पा0 सीमा के अन्दर) 2 एकड़ तक 79//1/2 आदि", "agricultural", 258.26),  # 1250000/acre
    ("Fatehabad", "Fatehabad", "सिरसा रोड मौजा फतेहाबाद (न0पा0 सीमा के अन्दर) 2 एकड़ हटकर मुरब्बा नम्बर 226 से 228,274,275,276,277,278,279 के शेष रकबा,280 के शेष रकबा, मुरब्बा 320,321", "agricultural", 144.63),  # 700000/acre
    ("Fatehabad", "Matana", "ओशो आश्रम कालोनी (वाक्या मौजा मताना 246//1 मिन,2 मिन,3 मिन,7 मिन,8 मिन,9 मिन,10 मिन, 245//5 मिन,6 मिन)", "residential", 3500),
    ("Fatehabad", "Fatehabad", "भागचन्द कालोनी (वाक्या मौजा फतेहाबाद 344//2/2,8,9/1)", "residential", 2500),
    ("Fatehabad", "Fatehabad", "भगत सिंह कालोनी (वाक्या मौजा फतेहाबाद 342//6 मिन,7 मिन,15 मिन)", "residential", 4400),
    ("Fatehabad", "BastiBhiwa", "Sunrise Realty Associators (Royal City) वाक्या मौजा बस्ती भीवा", "residential", 9000),
    # --- p-16 village list (sr 190-200) ---
    ("Fatehabad", "Dhangad", "गांव धांगड़ के 1000 वर्गगज तक गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 5500),
    ("Fatehabad", "Dhangad", "गांव धांगड़ के 1000 वर्गगज तक गैरमुमकिन प्लाट (रिहायशी)", "residential", 2500),
    ("Fatehabad", "Dhangad", "धांगड़", "agricultural", 351.24),  # 1700000/acre
    ("Fatehabad", "Dhangad", "धांगड़ हिसार रोड नेशनल हाईवे रोड नंबर 10 पर दो एकड़ तक", "agricultural", 1652.89),  # 8000000/acre
    ("Fatehabad", "Dhangad", "धांगड़ बाईपास का रकबा 2 एकड़ तक", "agricultural", 1652.89),  # 8000000/acre
    ("Fatehabad", "Kumharia", "कुम्हारिया", "agricultural", 268.6),  # 1300000/acre
    ("Fatehabad", "MohammadpurRohi", "मोहम्मदपुर रोही", "agricultural", 268.6),  # 1300000/acre
    ("Fatehabad", "KhajuriJati", "खजूरी जाटी", "agricultural", 268.6),  # 1300000/acre
    ("Fatehabad", "Badopal", "गांव बड़ोपल गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 4400),
    ("Fatehabad", "Badopal", "गांव बड़ोपल गैरमुमकिन (रिहायशी)", "residential", 2700),
    ("Fatehabad", "Badopal", "बड़ोपल", "agricultural", 309.92),  # 1500000/acre
    # --- p-17 (continuation + sr 201-211) ---
    ("Fatehabad", "Badopal", "बड़ोपल से कुम्हारिया लिंक रोड 179//21/1 ता 204//18 ता 23", "agricultural", 351.24),  # 1700000/acre
    ("Fatehabad", "Badopal", "बड़ोपल नेशनल हाईवे के दोनो तरफ 2 एकड तक", "agricultural", 1652.89),  # 8000000/acre
    ("Fatehabad", "Dharni", "धारनी", "agricultural", 289.26),  # 1400000/acre
    ("Fatehabad", "Kajalheri", "काजलहेड़ी", "agricultural", 289.26),  # 1400000/acre
    ("Fatehabad", "BhodaHoshnak", "गांव भोडा होशनाक गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 4000),
    ("Fatehabad", "BhodaHoshnak", "गांव भोडा होशनाक गैरमुमकिन (रिहायशी)", "residential", 2000),
    ("Fatehabad", "BhodaHoshnak", "भोडा होशनाक", "agricultural", 289.26),  # 1400000/acre
    ("Fatehabad", "BhodaHoshnak", "भोडा होशनाक नेशनल हाईवे के दोनो तरफ 2 एकड तक", "agricultural", 1446.28),  # 7000000/acre
    ("Fatehabad", "Kharakheri", "गांव खाराखेड़ी गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 4400),
    ("Fatehabad", "Kharakheri", "गांव खाराखेड़ी गैरमुमकिन (रिहायशी)", "residential", 2700),
    ("Fatehabad", "Kharakheri", "खाराखेड़ी", "agricultural", 309.92),  # 1500000/acre
    ("Fatehabad", "Kharakheri", "खाराखेड़ी नेशनल हाईवे के दोनो तरफ 2 एकड तक", "agricultural", 1549.59),  # 7500000/acre
    # --- p-18 (sr 212-221) ---
    ("Fatehabad", "Chindar", "चिन्दड़", "agricultural", 289.26),  # 1400000/acre
    ("Fatehabad", "Chindar", "चिन्दड़ से खाराखेड़ी बड़ोपल सारंगपुर भट्टू रोड तक", "agricultural", 320.25),  # 1550000/acre
    ("Fatehabad", "Bighad", "बीघड़", "agricultural", 309.92),  # 1500000/acre
    ("Fatehabad", "Bighad", "बीघड़ के लिंक रोड", "agricultural", 413.22),  # 2000000/acre
    ("Fatehabad", "Bighad", "बीघड़ चुंगी से दूरी 2,3 किलोमीटर मौजा बिघड़ (गुरु तेग बहादुर स्कूल तक नगर पालिका से बाहर)", "agricultural", 826.45),  # 4000000/acre
    ("Fatehabad", "Kukdawali", "गांव कुकड़ावाली गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 3500),
    ("Fatehabad", "Kukdawali", "गांव कुकड़ावाली गैरमुमकिन (रिहायशी)", "residential", 2000),
    ("Fatehabad", "Kukdawali", "कुकड़ावाली", "agricultural", 309.92),  # 1500000/acre
    ("Fatehabad", "Kukdawali", "नैशनल हाईवे 10 पर गांव कुकड़ावाली 2 एकड़ तक", "agricultural", 1446.28),  # 7000000/acre
    ("Fatehabad", "Bhodiakhera", "गांव भोड़ियाखेड़ा के 1000 वर्गगज तक गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 6000),
    ("Fatehabad", "Bhodiakhera", "गांव भोड़ियाखेड़ा के 1000 वर्गगज तक गैरमुमकिन प्लाट (रिहायशी)", "residential", 3000),
    ("Fatehabad", "Bhodiakhera", "भोड़ियाखेड़ा", "agricultural", 351.24),  # 1700000/acre
    # --- p-19 (sr 222-231) ---
    ("Fatehabad", "Bhodiakhera", "नैशनल हाईवे 10 पर गांव भोडियाखेड़ा 2 एकड़ तक", "agricultural", 1859.5),  # 9000000/acre
    ("Fatehabad", "Bhodiakhera", "भोडियाखेड़ा मिनी बाईपास के पास दो एकड़ तक", "agricultural", 1859.5),  # 9000000/acre
    ("Fatehabad", "Bhodiakhera", "फतेहाबाद से भोडिया रोड तक मौजा भोडियाखेड़ा (न0पा0 से बाहर) नैशनल हाईवे रोड 10 पर दो एकड़ तक", "agricultural", 1652.89),  # 8000000/acre
    ("Fatehabad", "Bhodiakhera", "फतेहाबाद से भट्टू रोड़ मौजा भोडियाखेड़ा से मानावाली हद तक", "agricultural", 1239.67),  # 6000000/acre
    ("Fatehabad", "Bhodiakhera", "फतेहाबाद से खरेतीखेड़ा सड़क (सरसा मेजर नहर तक) गांव भोडियाखेड़ा के 2 एकड़ तक", "agricultural", 1756.2),  # 8500000/acre
    ("Fatehabad", "GillaKhera", "गांव गिल्लाखेड़ा गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 4000),
    ("Fatehabad", "GillaKhera", "गांव गिल्लाखेड़ा गैरमुमकिन (रिहायशी)", "residential", 2000),
    ("Fatehabad", "GillaKhera", "गिल्लाखेड़ा", "agricultural", 309.92),  # 1500000/acre
    ("Fatehabad", "GillaKhera", "नैशनल हाईवे 10 पर गांव गिल्लाखेड़ा 2 एकड़ तक", "agricultural", 1446.28),  # 7000000/acre
    ("Fatehabad", "Karnoli", "गांव करनौली गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 4000),
    # --- p-20 (sr 232-245) ---
    ("Fatehabad", "Karnoli", "गांव करनौली गैरमुमकिन (रिहायशी)", "residential", 2000),
    ("Fatehabad", "Karnoli", "करनौली", "agricultural", 309.92),  # 1500000/acre
    ("Fatehabad", "Karnoli", "नैशनल हाईवे 10 पर गांव करनौली 126//18-19-20/1-20/2-21-22, 127//16-25", "agricultural", 1446.28),  # 7000000/acre
    ("Fatehabad", "Manawali", "मानावाली", "agricultural", 268.6),  # 1300000/acre
    ("Fatehabad", "Manawali", "फतेहाबाद से भट्टू रोड पर दो एकड़ तक गांव मानावाली", "agricultural", 516.53),  # 2500000/acre
    ("Fatehabad", "Sarwarpur", "सरवरपुर", "agricultural", 289.26),  # 1400000/acre
    ("Fatehabad", "Sarwarpur", "सरवरपुर के लिंक रोड के खसरा नं", "agricultural", 351.24),  # 1700000/acre
    ("Fatehabad", "Bodiwali", "बोदीवाली", "agricultural", 289.26),  # 1400000/acre
    ("Fatehabad", "Bodiwali", "बोदीवाली के लिंक रोड", "agricultural", 351.24),  # 1700000/acre
    ("Fatehabad", "KhairatiKhera", "खैराती खेड़ा", "agricultural", 309.92),  # 1500000/acre
    ("Fatehabad", "KhairatiKhera", "नैशनल हाईवे 9 पर गांव खैरातीखेड़ा 2 एकड़ तक", "agricultural", 1446.28),  # 7000000/acre
    ("Fatehabad", "Shahidawali", "गांव शहीदावाली गैरमुमकिन प्लाट (व्यवसायिक)", "commercial", 4000),
    ("Fatehabad", "Shahidawali", "गांव शहीदावाली गैरमुमकिन (रिहायशी)", "residential", 2000),
    ("Fatehabad", "Shahidawali", "शहीदावाली लिंक रोड मौजा शहीदावाली (दरियापुर बसस्टैंड) (व्यवसायिक)", "commercial", 6000),
    ("Fatehabad", "Shahidawali", "शहीदावाली लिंक रोड मौजा शहीदावाली (रिहायशी)", "residential", 2000),
    ("Fatehabad", "Shahidawali", "शहीदावाली", "agricultural", 309.92),  # 1500000/acre
]
