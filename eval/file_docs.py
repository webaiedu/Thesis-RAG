"""
Content of the file-upload benchmark: 12 fictional Bangladeshi documents (6 Bangla, 6 English) that need
the law to be answered, plus 4 non-law documents. All names, numbers and places are invented.
Used by make_files.py. Every reference answer is taken only from the gold sections listed.
"""
PC = "the-penal-code-1860-1860-s"
CR = "the-code-of-criminal-procedure-1898-1898-s"
BLA = "বাংলাদেশ-শ্রম-আইন-২০০৬-2006-s"
CM = "বাল্যবিবাহ-নিরোধ-আইন-২০১৭-2017-s"
DW = "যৌতুক-নিরোধ-আইন-২০১৮-2018-s"
MF = "the-muslim-family-laws-ordinance-1961-1961-s"
RG = "the-registration-act-1908-1908-s"
IT = "আয়কর-আইন-২০২৩-2023-s"
RENT = "বাড়ী-ভাড়া-নিয়ন্ত্রণ-আইন-১৯৯১-1991-s"
VAT = "মূল্য-সংযোজন-কর-ও-সম্পূরক-শুল্ক-আইন-২০১২-2012-s"

# text format: "docx" or "pdf" (text layer). Every doc is also made as a scanned PDF and a phone photo.
DOCS = [
    {"doc": "d01-appointment", "lang": "en", "text_format": "docx", "domain": "labour",
     "title": "RUPA GARMENTS LTD.",
     "body": """Plot 14, BSCIC Industrial Area, Konabari, Gazipur
Ref: RGL/HR/2026/0412                         Date: 05 January 2026

APPOINTMENT LETTER

To: Ms. Shirin Akter, Sewing Machine Operator (Grade 4)

We are pleased to appoint you as a permanent worker on the following terms:
1. Monthly wage: Tk 12,800 (basic Tk 7,500).
2. Working hours: 8:00 AM to 8:00 PM, with a one-hour lunch break, six days a week (Saturday to Thursday).
3. Weekly holiday: Friday.
4. Overtime beyond the above hours will be paid at the normal hourly rate of your basic wage.
5. Casual leave: 5 days per calendar year.
6. Either party may end this employment as per company policy.

Please sign the duplicate copy as acceptance.

Md. Kamal Hossain
Manager (HR & Admin)""",
     "questions": [
         ("According to this appointment letter, are my working hours legal?",
          BLA + "১০২",
          "No. The letter sets 11 working hours a day for six days, about 66 hours a week. Under section 102 of the Bangladesh Labour Act, 2006 an adult worker ordinarily works no more than 48 hours a week, and even with overtime the total may not exceed 60 hours in any week or an average of 56 hours a week over a year."),
         ("My letter says overtime is paid at the normal hourly rate. Is that allowed?",
          BLA + "১০৮",
          "No. Under section 108 of the Bangladesh Labour Act, 2006, a worker who works beyond the fixed hours is entitled to overtime at twice the ordinary rate of basic wage and dearness allowance (and any ad-hoc or interim wage), not the normal rate. (This does not apply to piece-rate workers.)"),
     ]},
    {"doc": "d02-termination", "lang": "bn", "text_format": "pdf", "domain": "labour",
     "title": "মেসার্স নদী নিটওয়্যার লিমিটেড",
     "body": """কাশিমপুর, গাজীপুর
স্মারক নং: এনএনএল/প্রশা/২০২৬/৭৭                তারিখ: ১০ ফেব্রুয়ারি ২০২৬

চাকরি অবসানের নোটিশ

প্রতি: জনাব মোঃ রফিকুল ইসলাম, সিনিয়র অপারেটর (স্থায়ী), কার্ড নং ৪৪১৮

প্রতিষ্ঠানের পুনর্গঠনের কারণে কর্তৃপক্ষ আপনার চাকরির অবসান করার সিদ্ধান্ত নিয়েছে। এই নোটিশ প্রাপ্তির ১৫ (পনের) দিন পর অর্থাৎ ২৫ ফেব্রুয়ারি ২০২৬ তারিখ হইতে আপনার চাকরির অবসান হইবে। আপনার মাসিক মজুরি ১৪,২০০ টাকা। আপনার পাওনাদি হিসাব বিভাগ হইতে বুঝিয়া লইবেন।

স্বাক্ষর
মোসাঃ নাসরিন সুলতানা
উপ-মহাব্যবস্থাপক (মানবসম্পদ)""",
     "questions": [
         ("এই চিঠিতে আমাকে মাত্র ১৫ দিনের নোটিশ দেওয়া হয়েছে। এটা কি আইনসম্মত?",
          BLA + "২৬",
          "না। চিঠি অনুযায়ী আপনি মাসিক মজুরিতে নিযুক্ত স্থায়ী শ্রমিক। বাংলাদেশ শ্রম আইন, ২০০৬-এর ধারা ২৬(১) অনুযায়ী মালিক এমন শ্রমিকের চাকরির অবসান করতে চাইলে একশত বিশ দিনের লিখিত নোটিশ দিতে হয়; ১৫ দিন যথেষ্ট নয়।"),
         ("মালিক যদি পুরো নোটিশ না দিয়ে আমাকে বিদায় করতে চায়, তাহলে আমাকে কী দিতে হবে?",
          BLA + "২৬",
          "বাংলাদেশ শ্রম আইন, ২০০৬-এর ধারা ২৬(৩) অনুযায়ী মালিক বিনা নোটিশে চাকরির অবসান করতে চাইলে নোটিশের পরিবর্তে নোটিশ মেয়াদের (এখানে একশত বিশ দিনের) মজুরি দিতে হবে।"),
     ]},
    {"doc": "d03-maternity", "lang": "en", "text_format": "pdf", "domain": "labour",
     "title": "GREENFIELD APPARELS LTD.",
     "body": """Ashulia, Savar, Dhaka
Office Memo No. GAL/ADM/2026/031                Date: 02 March 2026

Subject: Reply to maternity leave application

To: Mrs. Mitu Rani Das, Quality Inspector (joined 01 July 2025)

With reference to your application dated 25 February 2026, management has decided that you may take
4 (four) weeks of maternity leave without pay from your expected delivery date of 20 April 2026.
No maternity benefit will be paid as per company policy. You must rejoin on 18 May 2026, failing which
your job will be considered abandoned.

Abdul Mannan
Assistant Manager, Administration""",
     "questions": [
         ("The company says I get only 4 weeks of unpaid maternity leave. What does the law say?",
          BLA + "৪৬;" + BLA + "৪৮",
          "Under section 46 of the Bangladesh Labour Act, 2006, a woman worker who has worked at least six months for the employer before delivery is entitled to maternity benefit for 8 weeks before and 8 weeks after delivery (unless she already has two or more living children). By the memo she joined on 01 July 2025, so she will have worked more than six months by April 2026. Under section 48 the benefit is paid fully in cash at her average daily, weekly or monthly wage."),
         ("Can the company be punished for refusing to pay my maternity benefit?",
          BLA + "২৮৬",
          "Yes. Under section 286 of the Bangladesh Labour Act, 2006, an employer who deprives a woman worker of maternity benefit is punishable with a fine up to twenty-five thousand taka; the court may order the fine (or part of it) to be paid to her as compensation and will order the employer to give her the benefit she was denied."),
     ]},
    {"doc": "d04-talaq", "lang": "bn", "text_format": "pdf", "domain": "family",
     "title": "তালাকের নোটিশ",
     "body": """বরাবর
চেয়ারম্যান, ৫ নং মির্জাপুর ইউনিয়ন পরিষদ, টাঙ্গাইল

বিষয়: মুসলিম পারিবারিক আইন অধ্যাদেশ, ১৯৬১-এর ধারা ৭ অনুযায়ী তালাকের নোটিশ

জনাব,
আমি মোঃ সোহেল রানা, পিতা: মৃত আব্দুল জব্বার, গ্রাম: বাঁশতৈল। আমি আমার স্ত্রী মোসাঃ রুমানা আক্তারকে গত ১২ মার্চ ২০২৬ তারিখে তালাক প্রদান করিয়াছি। এই নোটিশের একটি অনুলিপি আমার স্ত্রীকে প্রদান করা হইল। উল্লেখ্য, আমার স্ত্রী বর্তমানে প্রায় পাঁচ মাসের অন্তঃসত্ত্বা।

নোটিশ প্রদানের তারিখ: ১৪ মার্চ ২০২৬

বিনীত
মোঃ সোহেল রানা""",
     "questions": [
         ("এই নোটিশ অনুযায়ী তালাক কবে কার্যকর হবে?",
          MF + "7",
          "মুসলিম পারিবারিক আইন অধ্যাদেশ, ১৯৬১-এর ধারা ৭(৩) অনুযায়ী আগে প্রত্যাহার না হলে চেয়ারম্যানের কাছে নোটিশ পৌঁছানোর দিন থেকে ৯০ দিন পর তালাক কার্যকর হয়। কিন্তু নোটিশে বলা আছে স্ত্রী অন্তঃসত্ত্বা, তাই ধারা ৭(৫) অনুযায়ী ৯০ দিন বা গর্ভাবস্থা, যেটি পরে শেষ হবে, তার আগে তালাক কার্যকর হবে না।"),
         ("চেয়ারম্যান এই নোটিশ পাওয়ার পর কী করবেন?",
          MF + "7",
          "মুসলিম পারিবারিক আইন অধ্যাদেশ, ১৯৬১-এর ধারা ৭(৪) অনুযায়ী নোটিশ পাওয়ার ৩০ দিনের মধ্যে চেয়ারম্যান স্বামী-স্ত্রীর মধ্যে সমঝোতার জন্য একটি সালিশি পরিষদ গঠন করবেন এবং সালিশি পরিষদ সমঝোতার জন্য প্রয়োজনীয় সব পদক্ষেপ নেবে।"),
     ]},
    {"doc": "d05-nikahnama", "lang": "en", "text_format": "docx", "domain": "family",
     "title": "NIKAHNAMA (Extract, English translation)",
     "body": """Office of the Nikah Registrar, Ward 22, Dhaka South City Corporation
Registration No. 1187/2023                       Date of marriage: 17 August 2023

Bridegroom: Mr. Tanvir Ahmed, age 29
Bride: Ms. Farzana Islam, age 24

Column 13 - Amount of dower (mohr): Tk 5,00,000 (five lakh)
Column 14 - Portion of dower paid at the time of marriage (muajjal): ----
Column 15 - Mode of payment of the remaining dower: ----
Column 16 - Special conditions: none

Signed by the parties, two witnesses and the Nikah Registrar.""",
     "questions": [
         ("My nikahnama does not say how the dower is to be paid. When can I claim it?",
          MF + "10",
          "Under section 10 of the Muslim Family Laws Ordinance, 1961, where the nikahnama or marriage contract gives no details about the mode of payment of dower, the entire dower (here Tk 5,00,000) is presumed to be payable on demand."),
         ("My husband has stopped giving me maintenance. What can I do?",
          MF + "9",
          "Under section 9 of the Muslim Family Laws Ordinance, 1961, if a husband fails to maintain his wife adequately, she may, besides any other legal remedy, apply to the Chairman, who will set up an Arbitration Council; the Council may issue a certificate fixing the maintenance the husband must pay, which is recoverable as arrears of land revenue if not paid."),
     ]},
    {"doc": "d06-invitation", "lang": "bn", "text_format": "docx", "domain": "children_women",
     "title": "শুভ বিবাহের নিমন্ত্রণ",
     "body": """পরম করুণাময়ের নামে শুরু করছি।
আগামী ১৮ এপ্রিল ২০২৬, শনিবার, আমার একমাত্র কন্যা
সুমাইয়া আক্তার (বয়স ১৬ বছর, দশম শ্রেণির ছাত্রী)
এর শুভ বিবাহ
মোঃ জাহিদ হাসান (বয়স ২৪ বছর), পিতা: মোঃ আবুল কালাম, গ্রাম: চরপাড়া
এর সহিত অনুষ্ঠিত হইবে।
স্থান: নিজ বাসভবন, গ্রাম: কালিকাপুর, উপজেলা: নাগেশ্বরী, কুড়িগ্রাম
আপনার সপরিবারে উপস্থিতি কামনা করি।
নিবেদক: মোঃ সিরাজুল ইসলাম (কনের পিতা)""",
     "questions": [
         ("এই দাওয়াতপত্রের বিয়েটা কি আইন অনুযায়ী বৈধ? বরের কী শাস্তি হতে পারে?",
          CM + "২;" + CM + "৭",
          "না। বাল্যবিবাহ নিরোধ আইন, ২০১৭-এর ধারা ২ অনুযায়ী বিয়ের ক্ষেত্রে ১৮ বছরের কম বয়সী নারী অপ্রাপ্তবয়স্ক, আর যে বিয়ের কোনো পক্ষ অপ্রাপ্তবয়স্ক তা বাল্যবিবাহ; কনের বয়স ১৬, তাই এটি বাল্যবিবাহ। ধারা ৭ অনুযায়ী প্রাপ্তবয়স্ক বর (২৪ বছর) বাল্যবিবাহ করলে অনধিক দুই বছর কারাদণ্ড বা অনধিক এক লক্ষ টাকা অর্থদণ্ড বা উভয় দণ্ড হতে পারে।"),
         ("কনের বাবা-মায়ের কী শাস্তি হতে পারে?",
          CM + "৮",
          "বাল্যবিবাহ নিরোধ আইন, ২০১৭-এর ধারা ৮ অনুযায়ী মা-বাবা বা অভিভাবক বাল্যবিবাহ সম্পন্ন করার কাজ করলে, অনুমতি বা নির্দেশ দিলে বা অবহেলায় বন্ধ করতে ব্যর্থ হলে অন্যূন ছয় মাস ও অনধিক দুই বছর কারাদণ্ড বা অনধিক পঞ্চাশ হাজার টাকা অর্থদণ্ড বা উভয় দণ্ড হবে।"),
     ]},
    {"doc": "d07-arrest", "lang": "en", "text_format": "pdf", "domain": "criminal",
     "title": "Letter to Advocate",
     "body": """To: Advocate Nusrat Jahan, Dhaka Judge Court
From: Md. Arif Hossain, Mirpur-10, Dhaka
Date: 14 May 2026

Dear Madam,
My younger brother Md. Asif Hossain (22) was arrested by police from our house at about 9:00 PM on
10 May 2026. They did not show any warrant. Nobody from the police informed our family where he was
taken; we found him at Pallabi Police Station the next afternoon. Today, 14 May, he is still in the
police station and has not been produced before any magistrate. No case number has been given to us.
Please advise what we can do.

Sincerely,
Md. Arif Hossain""",
     "questions": [
         ("Based on this letter, is it lawful for the police to keep my brother this long without taking him to a magistrate?",
          CR + "61",
          "No. Under section 61 of the Code of Criminal Procedure, 1898, a person arrested without a warrant may not be detained by police longer than is reasonable, and in no case more than 24 hours (excluding travel time to the Magistrate's Court) without a special order of a magistrate under section 167. He has been held since 10 May."),
         ("The police never told our family about the arrest. What should they have done according to the Appellate Division's guidelines?",
          "scob-8-ad-1-p4",
          "Under the Appellate Division's guidelines in Bangladesh & ors Vs. BLAST & ors (8 SCOB [2016] AD 1), the arresting officer must prepare a memorandum of arrest signed by the arrestee with date and time, and inform a nearest relative (or a friend suggested by the arrestee) as soon as practicable and not later than 12 hours after the arrest, stating the time and place of arrest and the place of custody."),
     ]},
    {"doc": "d08-dowry-sms", "lang": "bn", "text_format": "docx", "domain": "uncategorized",
     "title": "মোবাইল বার্তা (স্ক্রিনশটের লিখিত রূপ)",
     "body": """প্রেরক: ০১৭XXXXXX৫৬ (বরের মামা)
তারিখ: ০৩ জানুয়ারি ২০২৬, রাত ১০:১৫

"আসসালামু আলাইকুম বেয়াই সাহেব। বিয়ের তারিখ ঠিক রাখতে হলে ছেলেকে একটা পালসার মোটরসাইকেল আর নগদ দুই লাখ টাকা দিতে হবে। এগুলো না দিলে এই বিয়ে হবে না। বিষয়টা ভেবে আগামী শুক্রবারের মধ্যে জানাবেন।"

প্রাপক: মোঃ হারুন অর রশিদ (কনের পিতা)""",
     "questions": [
         ("এই মেসেজে যা চাওয়া হয়েছে তা কি অপরাধ? এর শাস্তি কী?",
          DW + "৩",
          "হ্যাঁ, এটি যৌতুক দাবি। যৌতুক নিরোধ আইন, ২০১৮-এর ধারা ৩ অনুযায়ী বিবাহের কোনো পক্ষ প্রত্যক্ষ বা পরোক্ষভাবে অন্য পক্ষের কাছে যৌতুক দাবি করলে তা অপরাধ, যার শাস্তি অন্যূন এক বছর ও অনধিক পাঁচ বছর কারাদণ্ড বা অনধিক পঞ্চাশ হাজার টাকা অর্থদণ্ড বা উভয় দণ্ড।"),
         ("এই অপরাধের মামলার তদন্ত ও বিচার কোন আইন অনুযায়ী হবে?",
          DW + "৮",
          "যৌতুক নিরোধ আইন, ২০১৮-এর ধারা ৮ অনুযায়ী এই আইনের অধীন অপরাধের তদন্ত, বিচার, আপিল ও সংশ্লিষ্ট অন্যান্য বিষয়ে ফৌজদারি কার্যবিধি, ১৮৯৮-এর বিধান প্রযোজ্য।"),
     ]},
    {"doc": "d09-gift-deed", "lang": "bn", "text_format": "pdf", "domain": "land",
     "title": "হেবা (দান) দলিলের খসড়া",
     "body": """দাতা: মোঃ আলতাফ হোসেন, পিতা: মৃত ইউসুফ আলী, সাং: পাটগ্রাম, লালমনিরহাট
গ্রহীতা: মোঃ রাকিবুল হাসান (দাতার পুত্র)

আমি স্বেচ্ছায় ও সজ্ঞানে আমার মালিকানাধীন পাটগ্রাম মৌজার জে.এল. নং ৪২, খতিয়ান নং ৩১৫, দাগ নং ১১৮৭-এর ৩৩ শতাংশ জমি আমার পুত্রকে হেবা (দান) করিলাম। আজ হইতে উক্ত জমিতে আমার আর কোনো স্বত্ব রহিল না।

দলিল সম্পাদনের তারিখ: ০৫ জানুয়ারি ২০২৬
সাক্ষী: ১. মোঃ জাকির হোসেন ২. মোঃ শফিকুল ইসলাম

(দ্রষ্টব্য: দলিলটি এখনো সাব-রেজিস্ট্রি অফিসে নিবন্ধন করা হয় নাই।)""",
     "questions": [
         ("এই দানপত্র এখনো রেজিস্ট্রি হয়নি। এতে কি জমির মালিকানা আমার নামে এসেছে?",
          RG + "17-p1;" + RG + "49",
          "না। রেজিস্ট্রেশন অ্যাক্ট, ১৯০৮-এর ধারা ১৭(১) অনুযায়ী স্থাবর সম্পত্তির দানপত্র ও হেবার ঘোষণা নিবন্ধন বাধ্যতামূলক, এবং ধারা ৪৯ অনুযায়ী নিবন্ধন বাধ্যতামূলক এমন দলিল নিবন্ধিত না হলে তা স্থাবর সম্পত্তিতে কোনো অধিকার, স্বত্ব বা স্বার্থ সৃষ্টি বা হস্তান্তর করে না।"),
         ("এই দলিল কত দিনের মধ্যে রেজিস্ট্রির জন্য দাখিল করতে হবে?",
          RG + "23",
          "রেজিস্ট্রেশন অ্যাক্ট, ১৯০৮-এর ধারা ২৩ অনুযায়ী উইল ছাড়া অন্য দলিল সম্পাদনের তারিখ থেকে তিন মাসের মধ্যে নিবন্ধনের জন্য দাখিল করতে হয়; দলিলটি ০৫ জানুয়ারি ২০২৬ সম্পাদিত, তাই এর তিন মাসের মধ্যে (ধারা ২৪-২৬-এর বিধান সাপেক্ষে)।"),
     ]},
    {"doc": "d10-rent", "lang": "en", "text_format": "pdf", "domain": "uncategorized",
     "title": "HOUSE RENT AGREEMENT",
     "body": """This agreement is made on 01 December 2025 at Dhaka between
Landlord: Mr. Mahbubur Rahman, House 37, Road 6, Block C, Mohammadpur, Dhaka
Tenant: Mr. Saiful Islam

1. The tenant takes the 3-bedroom flat on the 4th floor from 01 January 2026.
2. Monthly rent: Tk 25,000 (twenty-five thousand), payable by the 5th of each month.
3. Advance: the tenant has paid Tk 75,000 (three months' rent) as advance rent.
4. The rent will increase by 15% every year on 1 January.
5. Either party may end this agreement with two months' notice.

Signed: Landlord ..................   Tenant ..................
Witnesses: 1. ............  2. ............""",
     "questions": [
         ("My landlord took three months' rent in advance under this agreement. Is that allowed?",
          RENT + "১০;" + RENT + "২৩",
          "No, not without the Controller's approval. Under section 10 of the House Rent Control Act, 1991, a landlord may not demand or accept more than one month's rent as advance without the prior approval of the Controller. Under section 23(c), knowingly taking more than one month's advance rent without the Controller's written consent is an offence punishable with a fine."),
         ("Can the rent be raised by 15% every year as this agreement says?",
          RENT + "১৫;" + RENT + "১৬",
          "Not freely. Under section 15 of the House Rent Control Act, 1991, the Controller fixes the standard rent of a house, on the application of the landlord or tenant, so that the yearly rent equals 15% of the market value of the house; under section 16 the standard rent may be re-fixed on application every two years."),
     ]},
    {"doc": "d11-lottery", "lang": "en", "text_format": "docx", "domain": "tax",
     "title": "PRIZE NOTIFICATION",
     "body": """Bangla Shopping Festival 2026 - Lucky Coupon Draw
Organiser: Shapla Retail Ltd., Gulshan-2, Dhaka                Date: 28 February 2026

Dear Mr. Rakibul Hasan (Coupon No. 0451277),
Congratulations! You have won the FIRST PRIZE in our lucky coupon draw:
  - Cash prize: Tk 10,00,000 (ten lakh)
  - A motorcycle worth Tk 2,50,000
Please collect your prize from our head office within 30 days with your NID card.
Income tax will be deducted at source as required by law before the prize is handed over.

Fahim Chowdhury, Head of Marketing""",
     "questions": [
         ("How much tax will be deducted from the prize in this letter?",
          IT + "১১৮",
          "Under section 118 of the Income Tax Act, 2023, tax is deducted at 20% on winnings from a lottery or similar game, and the amount includes the value of any goods or property given to the winner. On a prize of Tk 10,00,000 cash plus a motorcycle worth Tk 2,50,000 (Tk 12,50,000 in total) that is Tk 2,50,000."),
         ("Who is responsible for deducting this tax?",
          IT + "১১৮",
          "Under section 118 of the Income Tax Act, 2023, the person responsible for paying the winnings (here the organiser, Shapla Retail Ltd.) must deduct the tax at 20% when making the payment."),
     ]},
    {"doc": "d12-vat-notice", "lang": "bn", "text_format": "pdf", "domain": "tax",
     "title": "কাস্টমস, এক্সাইজ ও ভ্যাট বিভাগীয় দপ্তর, ধানমন্ডি",
     "body": """নথি নং: ৫/মূসক/দাবিনামা/২০২৬/২১৪                    তারিখ: ১৫ মার্চ ২০২৬

প্রতি: মেসার্স রহমান ট্রেডার্স, বিআইএন: ০০০৪৫৬৭৮৯-০২০১

বিষয়: অপরিশোধিত মূল্য সংযোজন কর পরিশোধের দাবিনামা

আপনার প্রতিষ্ঠানের ২০২৫ সালের দাখিলপত্র পর্যালোচনায় ৩,৪০,০০০ টাকা মূসক অপরিশোধিত পাওয়া গিয়াছে। আগামী ৩০ দিনের মধ্যে উক্ত অর্থ পরিশোধ করিবার জন্য নির্দেশ দেওয়া হইল।

জারিকারকের মন্তব্য: প্রতিষ্ঠানটি সর্বশেষ জ্ঞাত ঠিকানায় পাওয়া যায় নাই এবং রেজিস্ট্রি ডাকযোগে প্রেরিত নোটিশ ফেরত আসিয়াছে; ইলেকট্রনিক পদ্ধতিতেও প্রেরণ সম্ভব হয় নাই। তাই নোটিশটি অত্র দপ্তরের নোটিশ বোর্ডে আঁটিয়া দেওয়া হইল।

সহকারী কমিশনার""",
     "questions": [
         ("নোটিশটি আমার হাতে পৌঁছায়নি, শুধু অফিসের নোটিশ বোর্ডে লাগানো হয়েছে। এটা কি বৈধভাবে জারি হয়েছে?",
          VAT + "১০৯",
          "হ্যাঁ। মূল্য সংযোজন কর ও সম্পূরক শুল্ক আইন, ২০১২-এর ধারা ১০৯(১) অনুযায়ী ব্যক্তিগতভাবে, সর্বশেষ জ্ঞাত ঠিকানায়, রেজিস্ট্রি ডাকে বা ইলেকট্রনিক পদ্ধতিতে জারি করা না গেলে সংশ্লিষ্ট মূসক কার্যালয়ের নোটিশ বোর্ডে আঁটিয়ে দিলেই তা যথাযথভাবে জারি হয়েছে বলে গণ্য হয়; নোটিশে লেখা আছে এর আগের পদ্ধতিগুলো সম্ভব হয়নি।"),
         ("আমি নোটিশের দাবির কিছু অংশ পরিশোধ করেছি। এখন কি নোটিশটি বৈধভাবে জারি হয়নি বলে আপত্তি তুলতে পারব?",
          VAT + "১০৯",
          "না। মূল্য সংযোজন কর ও সম্পূরক শুল্ক আইন, ২০১২-এর ধারা ১০৯(২) অনুযায়ী নোটিশ সম্পূর্ণ বা আংশিকভাবে পরিপালিত হওয়ার পর নোটিশ জারির বৈধতা নিয়ে কোনো প্রশ্ন তোলা যাবে না।"),
     ]},
]

# Non-law files: should be answered as "general" (the app answers file questions without a matching law
# domain from the file itself). One format each.
GENERAL_DOCS = [
    {"doc": "g01-recipe", "lang": "en", "format": "pdf", "title": "Simple Chicken Curry",
     "body": """Serves 4. Time: 45 minutes.
Ingredients: 1 kg chicken, 2 onions (sliced), 1 tbsp ginger-garlic paste, 1 tsp turmeric, 2 tsp chilli powder,
1 tsp cumin powder, 2 tomatoes, 4 tbsp oil, salt to taste, 2 cups water.
1. Heat the oil and fry the onions until golden brown.
2. Add ginger-garlic paste, turmeric, chilli and cumin; fry for 2 minutes with a little water.
3. Add the chicken and tomatoes; cook on high heat for 10 minutes, stirring.
4. Add water and salt, cover and simmer for 25 minutes until the chicken is tender.
Serve hot with rice.""",
     "question": "Summarise this recipe in three short steps.",
     "answer": "General (non-law) question about the attached file: a good answer summarises the recipe: fry onions and spices, cook the chicken with tomatoes, then simmer with water and salt for about 25 minutes."},
    {"doc": "g02-picnic", "lang": "bn", "format": "photo", "title": "বার্ষিক বনভোজন ২০২৬ - বিজ্ঞপ্তি",
     "body": """মিরপুর আদর্শ উচ্চ বিদ্যালয়
এতদ্বারা সকল শিক্ষার্থীকে জানানো যাইতেছে যে, আগামী ২০ ফেব্রুয়ারি ২০২৬ তারিখে বিদ্যালয়ের বার্ষিক বনভোজন গাজীপুরের ভাওয়াল জাতীয় উদ্যানে অনুষ্ঠিত হইবে।
চাঁদা: জনপ্রতি ৮০০ টাকা, ১০ ফেব্রুয়ারির মধ্যে শ্রেণিশিক্ষকের নিকট জমা দিতে হইবে।
বাস ছাড়িবে সকাল ৭টায় বিদ্যালয় প্রাঙ্গণ হইতে।
প্রধান শিক্ষক""",
     "question": "পিকনিক কবে, কোথায় এবং চাঁদা কত?",
     "answer": "General (non-law) question about the attached file: ২০ ফেব্রুয়ারি ২০২৬, ভাওয়াল জাতীয় উদ্যান (গাজীপুর); চাঁদা জনপ্রতি ৮০০ টাকা, ১০ ফেব্রুয়ারির মধ্যে জমা; বাস সকাল ৭টায় ছাড়বে।"},
    {"doc": "g03-cv", "lang": "en", "format": "docx", "title": "CURRICULUM VITAE - Nabila Karim",
     "body": """Email: nabila.karim@example.com | Phone: 01XXXXXXXXX | Dhaka
Objective: To get a job.
Education: BBA (Marketing), University of Dhaka, 2024, CGPA 3.41
Experience: Intern, Sales, ABC Foods Ltd., 3 months (2024)
Skills: MS Office, communication
References: Available on request""",
     "question": "Suggest two improvements to this CV.",
     "answer": "General (non-law) question about the attached file: e.g. replace the vague objective with a specific one, and describe the internship with concrete responsibilities or results (also add more specific skills)."},
    {"doc": "g04-essay", "lang": "bn", "format": "scan", "title": "আমাদের গ্রাম",
     "body": """আমাদের গ্রামের নাম শিমুলতলী। গ্রামের পাশ দিয়ে বয়ে গেছে ছোট্ট একটি নদী। বর্ষাকালে নদী ভরে যায়, আর শীতকালে চরে সরিষার হলুদ ফুল ফোটে। গ্রামের বেশিরভাগ মানুষ কৃষিকাজ করেন। এখানে একটি প্রাথমিক বিদ্যালয়, একটি মসজিদ আর একটি ছোট বাজার আছে। শহরের কোলাহল থেকে দূরে এই গ্রামের শান্ত পরিবেশ আমার খুব প্রিয়।""",
     "question": "এই লেখাটার মূল বক্তব্য কী?",
     "answer": "General (non-law) question about the attached file: লেখক তার শান্ত, কৃষিনির্ভর গ্রাম শিমুলতলীর বর্ণনা দিয়েছেন (নদী, সরিষা খেত, স্কুল, মসজিদ, বাজার) এবং গ্রামটি তার প্রিয়।"},
]
