import streamlit as st
import database as db

def admin_panel():
    st.markdown("""
    <div class="arena-badge"><div class="arena-dot"></div>ADMIN ACCESS</div>
    """, unsafe_allow_html=True)
    st.markdown("<h1 style='text-align: center;'>Admin Command Center</h1>", unsafe_allow_html=True)
    if not st.session_state.get('is_admin'):
        st.error("Access denied. Command Center is strictly for Admins.")
        return

    users = db.get_all_users()

    # ── OVERVIEW STATS ──
    total_users = len(users)
    pending_count = len([u for u in users if not u['is_approved']])
    winners_count = len([u for u in users if u['has_broken_guardrail']])
    testers_count = len([u for u in users if u.get('role') == 'tester'])
    st.markdown(f"""
    <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
        <div class="stat-card"><div class="stat-label">// TOTAL USERS</div><div class="stat-value">{total_users}</div></div>
        <div class="stat-card{' win' if pending_count else ''}"><div class="stat-label">// PENDING APPROVAL</div><div class="stat-value">{pending_count}</div></div>
        <div class="stat-card win"><div class="stat-label">// GUARDRAILS FULLY BROKEN</div><div class="stat-value">{winners_count}</div></div>
        <div class="stat-card"><div class="stat-label">// TESTERS</div><div class="stat-value">{testers_count}</div></div>
    </div>
    """, unsafe_allow_html=True)

    st.header("⚙️ Global Guardrail Settings")
    settings = db.get_settings()

    tab_badges = [('badge-g', '500 PTS · EASY'), ('badge-y', '800 PTS · MEDIUM'), ('badge-r', '1200 PTS · HARD')]
    tabs = st.tabs(["Guardrail 1", "Guardrail 2", "Guardrail 3"])
    
    for i, tab in enumerate(tabs):
        gid = i + 1
        g_data = settings.get(gid, {})
        with tab:
            b_class, b_text = tab_badges[i]
            st.markdown(f'<span class="badge {b_class}">{b_text}</span>', unsafe_allow_html=True)
            with st.form(f"settings_form_{gid}"):
                st.subheader(g_data.get('guardrail_name', f"Guardrail {gid}"))
                st.caption("🔒 The forbidden word below is only ever revealed to Admins and Testers — never to regular users.")
                m_name = st.text_input("Model Name", value=g_data.get('model_name', ''))
                s_prompt = st.text_area("System Prompt", value=g_data.get('system_prompt', ''), height=150)
                f_word = st.text_input("Forbidden Word", value=g_data.get('forbidden_word', ''))
                
                col1, col2 = st.columns(2)
                with col1:
                    temp = st.slider("Temperature", 0.0, 2.0, float(g_data.get('temperature', 0.7)), 0.05)
                    tp = st.slider("Top P", 0.0, 1.0, float(g_data.get('top_p', 0.9)), 0.01)
                with col2:
                    tokens = st.slider("Max Tokens", 128, 4096, int(g_data.get('max_tokens', 512)), 64)
                    rp = st.slider("Repetition Penalty", 0.0, 2.0, float(g_data.get('rep_pen', 1.0)), 0.1)
                
                if st.form_submit_button(f"Deploy Settings for Guardrail {gid}", width='stretch'):
                    db.update_guardrail_settings(gid, m_name, s_prompt, f_word, temp, tokens, tp, rp)
                    st.success(f"Global Settings for Guardrail {gid} successfully deployed!")

    st.divider()

    st.header("🛡️ Pending Approvals")
    pending_users = [u for u in users if not u['is_approved']]
    if pending_users:
        st.markdown(f'<span class="badge badge-y">{len(pending_users)} AWAITING REVIEW</span>', unsafe_allow_html=True)
        for u in pending_users:
            role_badge_class = 'badge-p' if u['role'] == 'tester' else 'badge-y'
            with st.expander(f"Review Profile: {u['username']} ({u['name']})"):
                st.markdown(f'<span class="badge {role_badge_class}">{u["role"].upper()}</span>', unsafe_allow_html=True)
                st.write(f"**Email:** {u['email']}")
                st.write(f"**Phone:** {u['phone_no']}")
                st.write(f"**Requested Role:** `{u['role']}`")
                
                if u['role'] == "tester":
                    st.write(f"**NU ID:** {u['nu_id']}")
                else:
                    st.write(f"**University:** {u['university']}")
                    st.write(f"**Roll No:** {u['roll_no']}")
                
                col1, col2 = st.columns(2)
                with col1:
                    if st.button(f"✅ Approve", key=f"approve_{u['id']}", type="primary", width='stretch'):
                        db.approve_user(u['id'])
                        st.success(f"{u['username']} has been approved!")
                        st.rerun()
                with col2:
                    if st.button(f"❌ Reject & Delete", key=f"reject_{u['id']}", width='stretch'):
                        db.delete_user(u['id'])
                        st.error(f"{u['username']} rejected and deleted.")
                        st.rerun()
    else:
        st.info("No pending approvals. All caught up!")

    st.divider()

    st.header("📊 User Database")
    if users:
        clean_users = []
        for u in users:
            clean_users.append({
                "ID": u['id'],
                "Username": u['username'],
                "Role": u['role'],
                "Status": "✅ Approved" if u['is_approved'] else "⏳ Pending",
                "Winner": "🏆 Yes" if u['has_broken_guardrail'] else "❌ No"
            })
        st.dataframe(clean_users, width='stretch')
    else:
        st.info("No users found.")

    st.divider()

    st.header("🔍 View Chat Transcripts")
    user_options = {f"{u['username']} ({u['role']}) {'🏅' if u['has_broken_guardrail'] else ''}": u['id'] for u in users}
    if user_options:
        selected_user = st.selectbox("Select User Profile", options=["-- Select User --"] + list(user_options.keys()))
        if selected_user != "-- Select User --":
            user_id = user_options[selected_user]
            chats = db.get_chats(user_id)
            if chats:
                with st.expander(f"Chat History for {selected_user}", expanded=True):
                    for chat in chats:
                        with st.chat_message(chat['role']):
                            st.caption(chat['timestamp'])
                            st.write(chat['content'])
            else:
                st.info("No chat transcripts found for this user.")

    st.divider()

    st.header("❌ Danger Zone")
    normal_users = {f"{u['username']} ({u['name']})": u for u in users if not u['is_admin']}
    if normal_users:
        st.warning("Deleting a user is permanent. All chat history will be completely wiped from the database.")
        del_sel = st.selectbox("Select User to Delete", options=["-- Select User --"] + list(normal_users.keys()), key="del_sel")
        if del_sel != "-- Select User --":
            u_data = normal_users[del_sel]
            if st.button(f"Permanently Delete {u_data['username']}", type="primary"):
                db.delete_user(u_data['id'])
                st.success(f"{u_data['username']} was permanently deleted.")
                st.rerun()