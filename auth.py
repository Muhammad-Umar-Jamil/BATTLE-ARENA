import streamlit as st
import database as db
import re

def login():
    st.markdown("#### // SECURE ACCESS TERMINAL<br>COMPETITOR AUTH", unsafe_allow_html=True)
    with st.form("login_form"):
        username = st.text_input("TEAM ID / CALLSIGN", key="login_username")
        password = st.text_input("ACCESS CODE", type="password", key="login_password")
        submitted = st.form_submit_button("INITIATE ACCESS", use_container_width=True)
        
        if submitted:
            if not username or not password:
                st.warning("Please provide both username and password.")
                return

            user = db.get_user(username)
            if user and db.check_password(password, user['password_hash']):
                st.session_state['user_id'] = user['id']
                st.session_state['username'] = user['username']
                st.session_state['name'] = user['name']
                st.session_state['role'] = user['role']
                st.session_state['is_admin'] = user['is_admin']
                st.session_state['is_approved'] = user['is_approved']
                st.session_state['has_broken_guardrail'] = user['has_broken_guardrail']
                st.success("Access Granted! Welcome back.")
                st.rerun()
            else:
                st.error("Invalid credentials. Try again.")

def signup():
    st.markdown("#### // SYSTEM REGISTRATION<br>NEW COMPETITOR", unsafe_allow_html=True)
    
    # Needs to be OUTSIDE the form so it selectively renders fields inside the form instantly!
    role = st.selectbox("OPERATIVE CLASS", ["user", "tester"], help="Testers must have an NU ID. Users must have a University Roll No.")
    
    with st.form("signup_form"):
        col1, col2 = st.columns(2)
        with col1:
            name = st.text_input("FULL DESIGNATION")
            new_user = st.text_input("CALLSIGN (USERNAME)")
            email = st.text_input("COMM LINK (EMAIL)")
            
        with col2:
            new_password = st.text_input("ACCESS CODE (PASSWORD)", type="password")
            phone_no = st.text_input("SECURE COMM (PHONE)")
            
            # Dynamic rendering based on role from outside the form
            if role == "tester":
                nu_id = st.text_input("NU ID (Format: 2xI-xxxx)", help="Example: 21I-0453")
                university = None
                roll_no = None
            else:
                nu_id = None
                university = st.text_input("University Name")
                roll_no = st.text_input("University Roll No.")
            
        submitted = st.form_submit_button("TRANSMIT REGISTRATION", use_container_width=True)
        
        if submitted:
            # Check basic required fields for everyone
            if not name or not new_user or not new_password or not email or not phone_no:
                st.warning("Please fill in all the basic required fields.")
                return
                
            # Check role specific fields
            if role == "tester":
                if not nu_id:
                    st.warning("Testers must provide an NU ID.")
                    return
                # Regex validation for NU ID (2xI-xxxx)
                if not re.match(r"^2\dI-\d{4}$", nu_id):
                    st.error("Invalid NU ID Format. It must match the format 2xI-xxxx (e.g. 21I-1234).")
                    return
            else:
                if not university or not roll_no:
                    st.warning("Users must provide a University Name and Roll No.")
                    return

            if db.get_user(new_user):
                st.error("This username is already taken. Choose another.")
            else:
                db.create_user(
                    username=new_user, 
                    password=new_password, 
                    name=name, 
                    email=email, 
                    role=role, 
                    phone_no=phone_no, 
                    nu_id=nu_id,
                    university=university,
                    roll_no=roll_no
                )
                st.success("Registration Sent! An Admin must approve your profile before you can talk to the AI.")
                st.balloons()
