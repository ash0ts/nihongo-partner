# Why the Sensei set is built the way it is

The "Sensei set" on the Path tab is ten drill items picked from the learner's own answer log. The picking is deterministic (`src/engine/composer.ts`); the model only writes the short paragraph that explains the set, and it may only mention rules the composer actually applied and numbers the composer reported. Each rule below has an id that appears in `ExerciseSet.rules`, in the Agent Lens span attribute `nihongo.set_rules`, and as a check in `evals/nihongo_evals/composer.py`.

## The rules

### `target-errors`: half the set goes after the traps you missed most

Feedback works best when it is specific to the error the learner made, and practice on the exact point of failure beats general review (Hattie and Timperley, 2007). The composer ranks the catalogued traps (`src/engine/traps.ts`) by misses and fills about half the set with items under the top three, weakest first.

### `contrast-pairs`: confusable pairs are practised side by side

For lookalike kana (シ/ツ, ソ/ン, は/ほ) the hard part is discrimination, not recall. Studies of inductive learning show that mixing confusable categories so the learner has to tell them apart beats blocking one category at a time (Kornell and Bjork, 2008; Birnbaum, Kornell, Bjork and Bjork, 2013). When a missed item belongs to a `pair-*` trap, the composer adds a partner item from the same pair that the learner has not missed.

### `interleave`: no trap three times in a row

Interleaving problem types improves later test performance even though it feels harder during practice (Rohrer and Taylor, 2007; Rohrer, 2012). The composer orders the set so the same trap never appears three times running, taking from the largest remaining trap bucket unless that would make a run.

### `retrieval`: every item asks you to produce the answer

Retrieving an answer from memory strengthens it more than re-reading or recognising it, the testing effect (Roediger and Karpicke, 2006). Items that can be typed are asked typed. Multiple choice only remains for items that have no typed form.

### `fade-scaffold`: multiple choice turns into typing once you have shown you know it

Worked examples and recognition formats help at first and then get in the way; fading them as competence grows is more effective than keeping them (Renkl and Atkinson, 2003; Kalyuga, 2007, on the expertise reversal effect). When an item has been answered correctly twice in a row, the composer switches it from choice to typed. In Classroom and Immersion modes kana recognition is always asked typed, matching how Lesson 3 will test it.

### `desirable-difficulty`: the set is pitched so you should get roughly 8 of 10 right

Learning is fastest when the material is hard enough to produce errors but not so hard that most answers are wrong. Bjork (1994) calls these desirable difficulties, and Wilson, Shenhav, Straccia and Cohen (2019) put the sweet spot for binary-outcome training near 85% accuracy. The composer estimates each item's accuracy from the log (a Beta prior with mean 0.7 and the weight of two answers, so thin evidence is not read as weakness) and tops the weak items up with strong ones until the set's mean predicted accuracy reaches about 0.8.

### `spacing`: items you just got right are left out

Spreading practice over time beats massing it (Cepeda, Pashler, Vul, Wixted and Rohrer, 2006), and the FSRS-style scheduler in `src/engine/srs.ts` already handles review timing across days. Within a session the composer skips items the learner answered correctly in the last ten events. A recent miss is not skipped: that is the point of a remedial set.

### `short-set`: ten items, then stop

Short, focused practice blocks keep cognitive load manageable (Sweller, 1988) and make it easy to repeat the loop: drill, see the misses, build the next set. The composer caps the set at ten (the server clamps requests to 4 to 20).

## What the model is allowed to do

The rationale paragraph is the only generated text. It is accepted when it is under 90 words and every number in it appears in the composer's `facts` (`src/engine/composer.ts`, `rationaleIsGrounded`); otherwise the deterministic sentence is shown and the span records `nihongo.source = deterministic`. The composer eval (`cd evals && uv run nihongo-evals composer`) re-checks all of the above on the frozen simulator sessions and asks a second model whether each rationale invented anything.

## References

- Birnbaum, M. S., Kornell, N., Bjork, E. L., and Bjork, R. A. (2013). Why interleaving enhances inductive learning: the roles of discrimination and retrieval. *Memory and Cognition*, 41, 392–402.
- Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In J. Metcalfe and A. Shimamura (eds.), *Metacognition: Knowing about knowing*. MIT Press.
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., and Rohrer, D. (2006). Distributed practice in verbal recall tasks: a review and quantitative synthesis. *Psychological Bulletin*, 132, 354–380.
- Hattie, J., and Timperley, H. (2007). The power of feedback. *Review of Educational Research*, 77, 81–112.
- Kalyuga, S. (2007). Expertise reversal effect and its implications for learner-tailored instruction. *Educational Psychology Review*, 19, 509–539.
- Kornell, N., and Bjork, R. A. (2008). Learning concepts and categories: is spacing the "enemy of induction"? *Psychological Science*, 19, 585–592.
- Renkl, A., and Atkinson, R. K. (2003). Structuring the transition from example study to problem solving in cognitive skill acquisition. *Educational Psychologist*, 38, 15–22.
- Roediger, H. L., and Karpicke, J. D. (2006). Test-enhanced learning: taking memory tests improves long-term retention. *Psychological Science*, 17, 249–255.
- Rohrer, D. (2012). Interleaving helps students distinguish among similar concepts. *Educational Psychology Review*, 24, 355–367.
- Rohrer, D., and Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science*, 35, 481–498.
- Sweller, J. (1988). Cognitive load during problem solving: effects on learning. *Cognitive Science*, 12, 257–285.
- Wilson, R. C., Shenhav, A., Straccia, M., and Cohen, J. D. (2019). The Eighty Five Percent Rule for optimal learning. *Nature Communications*, 10, 4646.
