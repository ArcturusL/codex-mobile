### Feature: Per-thread model selection

#### Prerequisites
- App is running from this repository against a Codex app-server that supports thread-scoped model persistence.
- At least two selectable models are available in the composer model picker.
- At least one existing thread is available, or you can create one during the test.

#### Steps
1. On the new-thread screen, choose model `A` in the composer.
2. Send a message to create a new thread.
3. In that thread, switch the composer model to model `B`.
4. Send another message in the same thread so the thread persists model `B`.
5. Create or open a different thread and set its model to model `A`.
6. Switch back and forth between the two threads.
7. Refresh the browser while one of the threads is selected.
8. Re-open both threads again after the refresh.
9. While thread `A` is selected, use the sidebar thread menu to fork thread `B`.
10. Open the forked thread and confirm the composer model matches thread `B`, not the currently selected thread.
11. Restart the app-server or otherwise force a model-list refresh that does not include one thread’s persisted model, then switch back to that thread.
12. Delete one of the test threads you changed, refresh the thread list, and continue switching between the remaining thread and the new-thread screen.

#### Expected Results
- Each thread restores its own last selected model when you switch threads.
- The new-thread screen inherits the most recent manual model choice for the active provider. Merely opening another thread does not change that default.
- After browser refresh, reopening a thread restores the model persisted for that thread.
- Forked or newly created threads keep the resolved model returned by Codex, including fallback to the supported default model when needed.
- Forking a nonselected thread from the sidebar uses that source thread’s persisted model.
- If the selected thread’s persisted model is not returned in the latest model list, the composer still shows that model as the active selection instead of falling back to the placeholder label.
- Removing a thread prunes its saved per-thread model state, and model selection continues to update normally for the remaining threads without runtime errors.

#### Rollback/Cleanup
- Reset each tested thread back to its original model selection if you changed an existing conversation for the test.


### Feature: Remember composer choices

#### Prerequisites
- Use the same browser and origin with local storage enabled; record the original picker values.

#### Steps
1. In an existing thread choose a different model, High thinking, and Read only access without sending a message.
2. Immediately refresh, reopen that thread, and check all three pickers.
3. Open a new chat and check the same selections after model metadata loads.
4. Change thinking to Default, refresh, and check it remains Default.
5. Switch between existing threads with different saved permissions and models.
6. Repeat the refresh check in light and dark themes.

#### Expected Results
- All three choices survive refresh; a server default does not overwrite explicit thinking or an available saved model.
- New chats inherit the last manual model for their provider and the last access choice. Existing threads retain their own permission/model choices.
- Picking options sends no turn or configuration RPC; persistence uses local storage only.

#### Rollback/Cleanup
- Restore the original picker values. Browser site-data removal clears remembered choices.
